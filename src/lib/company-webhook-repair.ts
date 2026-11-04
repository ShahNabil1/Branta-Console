import { ownedWebhookAddress } from "./company-webhook-policy";

type Provider = "resend" | "brevo";
type Hook = { id: string | number; endpoint?: string; url?: string; events?: string[]; status?: string; type?: string; signing_secret?: string };
type Result = { ok: boolean; status: number; body: { data?: Hook[]; webhooks?: Hook[]; has_more?: boolean; id?: string | number; signing_secret?: string; message?: string; code?: string } & Partial<Hook> };
type Patch = { webhook_secret_enc?: string | null; webhook_secret_hint?: string | null; webhook_verified_at: string | null; webhook_events: string[] };
export type RepairDependencies = {
  provider: Provider;
  baseUrl: string;
  companyName: string;
  events: readonly string[];
  call: (path: string, init?: { method?: string; body?: unknown }) => Promise<Result>;
  save: (patch: Patch) => Promise<void>;
  seal: (secret: string) => Promise<string>;
  token: () => string;
};

/** Lists every Resend page; never returns private webhook addresses to the UI. */
export async function listRepairHooks(provider: Provider, call: RepairDependencies["call"]): Promise<Hook[]> {
  const hooks: Hook[] = [];
  let after: string | undefined;
  const cursors = new Set<string>();
  while (true) {
    const path = provider === "resend"
      ? `/webhooks?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`
      : "/webhooks?type=transactional";
    const result = await call(path);
    if (provider === "brevo" && result.status === 400 && result.body?.code === "document_not_found") return [];
    assertOk(result, "Read webhooks");
    const page = provider === "resend" ? result.body?.data ?? [] : result.body?.webhooks ?? [];
    hooks.push(...page);
    if (provider === "brevo" || !result.body?.has_more) return hooks;
    const last = page.at(-1)?.id;
    if (last === undefined || cursors.has(String(last))) throw new Error("Could not read the complete webhook list. Nothing was removed.");
    after = String(last);
    cursors.add(after);
  }
}

function assertOk(result: Result, operation: string) {
  // Provider bodies may echo private URLs/credentials; never send those to the client.
  if (!result.ok) throw new Error(`${operation} failed (HTTP ${result.status}). ${result.status === 401 || result.status === 403 ? "Check the provider API key and webhook permissions." : "Please retry after checking the provider account."}`);
}

export async function replaceCompanyWebhook(d: RepairDependencies) {
  const hooks = await listRepairHooks(d.provider, d.call);
  const owned = hooks.filter(h => ownedWebhookAddress(h.endpoint ?? h.url ?? "", d.baseUrl));
  for (const hook of owned) {
    const deleted = await d.call(`/webhooks/${encodeURIComponent(String(hook.id))}`, { method: "DELETE" });
    if (deleted.status !== 404) assertOk(deleted, "Remove previous company webhook");
  }
  // Keep API/sender settings and history; invalidate only the replaced credential.
  await d.save({ webhook_secret_enc: null, webhook_secret_hint: null, webhook_verified_at: null, webhook_events: [] });
  let secret = d.provider === "brevo" ? d.token() : null;
  const url = new URL(d.baseUrl);
  if (secret) {
    url.searchParams.set("token", secret);
    await d.save({ webhook_secret_enc: await d.seal(secret), webhook_secret_hint: null, webhook_verified_at: null, webhook_events: [] });
  }
  const endpoint = url.toString();
  const created = await d.call("/webhooks", {
    method: "POST",
    body: d.provider === "resend"
      ? { endpoint, events: [...d.events] }
      : { url: endpoint, description: `Branta Console · ${d.companyName}`, events: [...d.events], type: "transactional" },
  });
  assertOk(created, "Register new company webhook");
  if (d.provider === "resend") secret = created.body?.signing_secret ?? null;
  if (!secret || created.body?.id === undefined) throw new Error("The provider did not return the new webhook credential or ID. Retry Fix.");
  const encrypted = await d.seal(secret);
  await d.save({ webhook_secret_enc: encrypted, webhook_secret_hint: null, webhook_verified_at: null, webhook_events: [] });
  const read = await d.call(`/webhooks/${encodeURIComponent(String(created.body.id))}`);
  assertOk(read, "Verify new company webhook");
  const h = read.body;
  if ((h.endpoint ?? h.url) !== endpoint || d.events.some(e => !h.events?.includes(e)) ||
      (d.provider === "resend" ? h.status !== "enabled" : h.type !== "transactional")) {
    throw new Error("The new webhook is not fully active yet. Retry Fix; the check has not been marked successful.");
  }
  await d.save({ webhook_secret_enc: encrypted, webhook_secret_hint: null, webhook_verified_at: new Date().toISOString(), webhook_events: [...d.events] });
  return { ok: true, removed: owned.length, eventCount: d.events.length };
}