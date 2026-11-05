import { expect, it } from "vitest";
import { repairResendDomain, repairBrevoDomain } from "./provider-repair";

it("creates missing sender domain, enables tracking/TLS, publishes returned DNS and verifies", async () => {
  const calls: { path: string; init: any }[] = []; const pushed: any[] = [];
  const d: any = { id: "domain-1", status: "pending", records: [{ type: "CNAME", name: "links", value: "track.resend.com", status: "pending" }] };
  const result = await repairResendDomain("deveror.com", "links", async (path, init) => {
    calls.push({ path, init });
    if (path === "/domains" && !init) return { ok: true, status: 200, body: { data: [] } };
    if (init?.method === "PATCH") Object.assign(d, init.body);
    if (path.endsWith("/verify")) { d.status = "verified"; d.records[0].status = "verified"; }
    return { ok: true, status: 200, body: d };
  }, async records => { pushed.push(...records); return { ok: true, detail: "DNS saved" }; });
  expect(calls.find(c => c.path === "/domains" && c.init)?.init.body).toEqual({ name: "deveror.com" });
  expect(calls.find(c => c.init?.method === "PATCH")?.init.body).toEqual({ tracking_subdomain: "links", open_tracking: true, click_tracking: true, tls: "opportunistic" });
  expect(pushed[0].value).toBe("track.resend.com"); expect(result.ok).toBe(true);
});
it("does not mutate DNS when provider credentials are rejected", async () => {
  let pushed = false;
  await expect(repairResendDomain("deveror.com", "links", async () => ({ ok: false, status: 400, body: { message: "API key is invalid" } }), async () => { pushed = true; return { ok: true, detail: "" }; })).rejects.toThrow("API key is invalid");
  expect(pushed).toBe(false);
});
it("keeps DNS propagation pending rather than declaring success", async () => {
  const d = { id: "d", status: "pending", tracking_subdomain: "links", open_tracking: true, click_tracking: true, tls: "opportunistic", records: [{ status: "pending" }] };
  const result = await repairResendDomain("deveror.com", "links", async path => ({ ok: true, status: 200, body: path === "/domains" ? { data: [{ id: "d", name: "deveror.com" }] } : d }), async () => ({ ok: true, detail: "DNS saved" }));
  expect(result.ok).toBe(false); expect(result.pending).toBe(true);
});
it("maps Brevo DNS fields and requires an active sender before success", async () => {
  let records: any[] = [];
  const result = await repairBrevoDomain("deveror.com", "hello@deveror.com", "Deveror", async path => ({ ok: true, status: 200, body: path === "/senders" ? { senders: [{ email: "hello@deveror.com", active: false }] } : { authenticated: true, dns_records: { dkim_record: { host_name: "mail._domainkey", type: "TXT", value: "v=DKIM1" } } } }), async r => { records = r; return { ok: true, detail: "DNS saved" }; });
  expect(records).toEqual([{ name: "mail._domainkey", type: "TXT", value: "v=DKIM1" }]); expect(result.ok).toBe(false); expect(result.pending).toBe(true);
});