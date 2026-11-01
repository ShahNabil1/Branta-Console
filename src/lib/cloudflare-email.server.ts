// Server-only Cloudflare Email Routing helper (brantatech.com zone only).
// Secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ZONE_ID.
const CF_API = "https://api.cloudflare.com/client/v4";

function cfg() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const zone = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !account || !zone) throw new Error("Cloudflare Email Routing is not configured.");
  return { token, account, zone };
}

export function cloudflareConfigured() {
  return !!(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ZONE_ID);
}

async function cf<T>(path: string, init?: RequestInit): Promise<T> {
  const { token } = cfg();
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { message: string }[] };
  if (!res.ok || !body.success) {
    const msg = body.errors?.[0]?.message ?? `HTTP ${res.status}`;
    console.error("Cloudflare email routing error", res.status, msg);
    if (res.status === 403) throw new Error("Cloudflare token lacks Email Routing permission for brantatech.com.");
    throw new Error(`Cloudflare: ${msg}`);
  }
  return body.result as T;
}

type Address = { id: string; email: string; verified: string | null };
type Rule = { id: string; matchers: { type: string; field?: string; value?: string }[] };

export type DestinationStatus = "verified" | "pending";

/** Ensures the Gmail exists as a destination; Cloudflare emails a verification link when new. */
export async function ensureDestination(gmail: string): Promise<DestinationStatus> {
  const { account } = cfg();
  const target = gmail.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const list = await cf<Address[]>(`/accounts/${account}/email/routing/addresses?per_page=50&page=${page}`);
    const hit = list.find((a) => a.email.toLowerCase() === target);
    if (hit) return hit.verified ? "verified" : "pending";
    if (list.length < 50) break;
  }
  await cf(`/accounts/${account}/email/routing/addresses`, { method: "POST", body: JSON.stringify({ email: target }) });
  return "pending";
}

/** Creates (or replaces) the forward rule brantaEmail -> gmail. Returns rule id. */
export async function upsertForwardRule(brantaEmail: string, gmail: string): Promise<string> {
  const { zone } = cfg();
  const to = brantaEmail.toLowerCase();
  const payload = {
    name: `Branta Console: ${to}`,
    enabled: true,
    matchers: [{ type: "literal", field: "to", value: to }],
    actions: [{ type: "forward", value: [gmail.toLowerCase()] }],
  };
  for (let page = 1; page <= 20; page++) {
    const rules = await cf<Rule[]>(`/zones/${zone}/email/routing/rules?per_page=50&page=${page}`);
    const hit = rules.find((r) => r.matchers?.some((m) => m.type === "literal" && m.value?.toLowerCase() === to));
    if (hit) {
      await cf(`/zones/${zone}/email/routing/rules/${hit.id}`, { method: "PUT", body: JSON.stringify(payload) });
      return hit.id;
    }
    if (rules.length < 50) break;
  }
  const created = await cf<{ id: string }>(`/zones/${zone}/email/routing/rules`, { method: "POST", body: JSON.stringify(payload) });
  return created.id;
}

export async function deleteRule(ruleId: string) {
  const { zone } = cfg();
  await cf(`/zones/${zone}/email/routing/rules/${ruleId}`, { method: "DELETE" }).catch(() => {});
}

type FullRule = Rule & { actions?: { type: string; value?: string[] }[] };

/** Branta addresses whose forward rules already deliver to this Gmail. */
export async function forwardSourcesFor(gmail: string): Promise<string[]> {
  const { zone } = cfg();
  const target = gmail.toLowerCase();
  const out: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const rules = await cf<FullRule[]>(`/zones/${zone}/email/routing/rules?per_page=50&page=${page}`);
    for (const r of rules) {
      if (!r.actions?.some((a) => a.type === "forward" && a.value?.some((v) => v.toLowerCase() === target))) continue;
      for (const m of r.matchers ?? []) if (m.type === "literal" && m.value) out.push(m.value.toLowerCase());
    }
    if (rules.length < 50) break;
  }
  return out;
}

/** All destination addresses with their verification state. */
export async function listDestinations(): Promise<{ email: string; verified: boolean; created: string | null }[]> {
  const { account } = cfg();
  const out: { email: string; verified: boolean; created: string | null }[] = [];
  for (let page = 1; page <= 20; page++) {
    const list = await cf<(Address & { created?: string })[]>(`/accounts/${account}/email/routing/addresses?per_page=50&page=${page}`);
    for (const a of list) out.push({ email: a.email.toLowerCase(), verified: !!a.verified, created: a.created ?? null });
    if (list.length < 50) break;
  }
  return out;
}

/** Reads a rule back from Cloudflare to confirm it is live. */
export async function getRuleEnabled(ruleId: string): Promise<boolean> {
  const { zone } = cfg();
  const r = await cf<{ enabled?: boolean }>(`/zones/${zone}/email/routing/rules/${ruleId}`);
  return r.enabled !== false;
}

/** Deletes every forward rule whose literal "to" matcher is this address. Returns number removed (0 = already gone). */
export async function deleteRulesFor(brantaEmail: string): Promise<number> {
  const { zone } = cfg();
  const to = brantaEmail.toLowerCase();
  const ids: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const rules = await cf<Rule[]>(`/zones/${zone}/email/routing/rules?per_page=50&page=${page}`);
    for (const r of rules) if (r.matchers?.some((m) => m.type === "literal" && m.value?.toLowerCase() === to)) ids.push(r.id);
    if (rules.length < 50) break;
  }
  for (const id of ids) await cf(`/zones/${zone}/email/routing/rules/${id}`, { method: "DELETE" });
  return ids.length;
}

/** Deletes a destination address. Returns false when Cloudflare no longer has it. */
export async function deleteDestination(gmail: string): Promise<boolean> {
  const { account } = cfg();
  const target = gmail.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const list = await cf<(Address & { tag?: string })[]>(`/accounts/${account}/email/routing/addresses?per_page=50&page=${page}`);
    const hit = list.find((a) => a.email.toLowerCase() === target);
    if (hit) { await cf(`/accounts/${account}/email/routing/addresses/${hit.tag ?? hit.id}`, { method: "DELETE" }); return true; }
    if (list.length < 50) break;
  }
  return false;
}
