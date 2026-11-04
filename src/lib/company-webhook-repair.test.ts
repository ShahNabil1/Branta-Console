import { describe, expect, it } from "vitest";
import { listRepairHooks, replaceCompanyWebhook, type RepairDependencies } from "./company-webhook-repair";

function fixture(provider: "resend" | "brevo") {
  const baseUrl = `https://console.brantatech.com/api/public/${provider}/webhook?company=deveror`;
  const calls: { path: string; method: string; body?: unknown }[] = [];
  const saves: Parameters<RepairDependencies["save"]>[0][] = [];
  let created: Record<string, unknown> = {};
  let failDelete = false;
  let failSave = false;
  const deps: RepairDependencies = {
    provider, baseUrl, companyName: "Deveror", events: provider === "resend" ? ["email.sent", "email.received"] : ["request", "uniqueOpened"],
    token: () => "fixture-only-token", seal: async () => "encrypted-fixture",
    save: async patch => { if (failSave) throw new Error("Save failed"); saves.push(patch); },
    call: async (path, init) => {
      const method = init?.method ?? "GET";
      calls.push({ path, method, body: init?.body });
      const hooks = [
        { id: "owned-1", endpoint: baseUrl, url: `${baseUrl}&token=old` },
        { id: "owned-2", endpoint: baseUrl, url: `${baseUrl}&token=older` },
        { id: "other-company", endpoint: `${baseUrl}-other`, url: `${baseUrl}-other&token=old` },
        { id: "other-system", endpoint: "https://other.example/hook", url: "https://other.example/hook" },
      ];
      if (path.includes("?") && method === "GET") return { ok: true, status: 200, body: { data: hooks, webhooks: hooks } };
      if (method === "DELETE") return { ok: !failDelete, status: failDelete ? 403 : 200, body: {} };
      if (method === "POST") {
        created = init?.body as Record<string, unknown>;
        return { ok: true, status: 200, body: { id: "new", signing_secret: "fixture-only-signing-secret" } };
      }
      return { ok: true, status: 200, body: { ...created, status: "enabled", type: "transactional" } };
    },
  };
  return { deps, calls, saves, failDelete: () => { failDelete = true; }, failSave: () => { failSave = true; } };
}

describe("company webhook replacement", () => {
  for (const provider of ["resend", "brevo"] as const) {
    it(`${provider}: removes only this company's old hooks, creates all events and saves fresh encrypted credentials`, async () => {
      const f = fixture(provider);
      expect(await replaceCompanyWebhook(f.deps)).toEqual({ ok: true, removed: 2, eventCount: 2 });
      expect(f.calls.filter(c => c.method === "DELETE").map(c => c.path)).toEqual(["/webhooks/owned-1", "/webhooks/owned-2"]);
      expect(f.saves[0].webhook_secret_enc).toBeNull();
      expect(f.saves.at(-1)?.webhook_secret_enc).toBe("encrypted-fixture");
      expect(f.saves.at(-1)?.webhook_verified_at).toBeTruthy();
      expect(f.saves.at(-1)?.webhook_events).toEqual(f.deps.events);
      const body = f.calls.find(c => c.method === "POST")?.body as { events: string[]; url?: string };
      expect(body.events).toEqual(f.deps.events);
      if (provider === "brevo") expect(new URL(body.url ?? "").searchParams.has("token")).toBe(true);
    });
  }
  it("deletion failure retains saved credentials and never creates a replacement", async () => {
    const f = fixture("resend"); f.failDelete();
    await expect(replaceCompanyWebhook(f.deps)).rejects.toThrow("HTTP 403");
    expect(f.saves).toHaveLength(0);
    expect(f.calls.some(c => c.method === "POST")).toBe(false);
  });
  it("persistence failure is not reported as repaired", async () => {
    const f = fixture("brevo"); f.failSave();
    await expect(replaceCompanyWebhook(f.deps)).rejects.toThrow("Save failed");
    expect(f.calls.some(c => c.method === "POST")).toBe(false);
  });
  it("incomplete provider readback never marks verification successful", async () => {
    const f = fixture("resend"); const call = f.deps.call;
    f.deps.call = async (path, init) => path === "/webhooks/new" ? { ok: true, status: 200, body: { endpoint: f.deps.baseUrl, events: ["email.sent"], status: "enabled" } } : call(path, init);
    await expect(replaceCompanyWebhook(f.deps)).rejects.toThrow("not fully active");
    expect(f.saves.every(s => s.webhook_verified_at === null)).toBe(true);
  });
  it("Resend follows pagination before choosing old hooks", async () => {
    const paths: string[] = [];
    const hooks = await listRepairHooks("resend", async path => {
      paths.push(path);
      return { ok: true, status: 200, body: { data: [{ id: paths.length === 1 ? "first" : "last" }], has_more: paths.length === 1 } };
    });
    expect(paths).toEqual(["/webhooks?limit=100", "/webhooks?limit=100&after=first"]);
    expect(hooks.map(h => h.id)).toEqual(["first", "last"]);
  });
  it("Brevo's no-webhooks response is an empty inventory", async () => {
    expect(await listRepairHooks("brevo", async () => ({ ok: false, status: 400, body: { code: "document_not_found" } }))).toEqual([]);
  });
});