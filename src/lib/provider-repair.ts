export type RepairResponse = { ok: boolean; status: number; body: any };
type Call = (path: string, init?: { method?: string; body?: unknown }) => Promise<RepairResponse>;
function requireOk(r: RepairResponse) {
  if (!r.ok) throw new Error(`Provider ${r.status}: ${r.body?.message ?? "request failed"}`);
  return r.body;
}

export async function repairResendDomain(domain: string, subdomain: string, call: Call, push: (records: any[]) => Promise<{ ok: boolean; detail: string }>) {
  const list = requireOk(await call("/domains"));
  let d = (list?.data ?? []).find((item: any) => String(item.name).toLowerCase() === domain);
  if (d && d.region && d.region !== "ap-northeast-1") { requireOk(await call(`/domains/${encodeURIComponent(d.id)}`, { method: "DELETE" })); d = null; }
  if (!d) d = requireOk(await call("/domains", { method: "POST", body: { name: domain, region: "ap-northeast-1" } }));
  const path = `/domains/${encodeURIComponent(d.id)}`;
  d = requireOk(await call(path));
  const body: Record<string, unknown> = { open_tracking: true, click_tracking: true, tls: "opportunistic" };
  if (!d.tracking_subdomain) body.tracking_subdomain = subdomain;
  requireOk(await call(path, { method: "PATCH", body }));
  d = requireOk(await call(path));
  if (!Array.isArray(d.records) || !d.records.length) throw new Error("Resend did not return DNS records. Retry the domain check.");
  const pushed = await push(d.records);
  if (!pushed.ok) throw new Error(pushed.detail);
  requireOk(await call(`${path}/verify`, { method: "POST" }));
  d = requireOk(await call(path));
  const ok = d.status === "verified" && d.records.every((r: any) => String(r.status).toLowerCase() === "verified") && !!d.tracking_subdomain && d.open_tracking === true && d.click_tracking === true && d.tls === "opportunistic";
  return { ok, pending: !ok && d.status !== "failed", detail: ok ? `${domain} and tracking verified · ${pushed.detail}` : `${pushed.detail} · Resend verification ${d.status ?? "pending"}` };
}

export async function repairBrevoDomain(domain: string, email: string, name: string, call: Call, push: (records: any[]) => Promise<{ ok: boolean; detail: string }>) {
  const path = `/senders/domains/${encodeURIComponent(domain)}`;
  let result = await call(path);
  if (!result.ok && result.status !== 404) requireOk(result);
  if (result.status === 404) {
    requireOk(await call("/senders/domains", { method: "POST", body: { name: domain } }));
    result = await call(path);
  }
  let d = requireOk(result);
  const records = Object.values(d.dns_records ?? {}).map((r: any) => ({ name: r.host_name, type: r.type, value: r.value }));
  if (!records.length) throw new Error("Brevo did not return DNS records. Retry the domain check.");
  const pushed = await push(records);
  if (!pushed.ok) throw new Error(pushed.detail);
  requireOk(await call(`${path}/authenticate`, { method: "PUT" }));
  d = requireOk(await call(path));
  const senders = requireOk(await call("/senders"));
  let sender = (senders.senders ?? []).find((s: any) => String(s.email).toLowerCase() === email);
  if (!sender) {
    requireOk(await call("/senders", { method: "POST", body: { name, email } }));
    sender = (requireOk(await call("/senders")).senders ?? []).find((s: any) => String(s.email).toLowerCase() === email);
  }
  const ok = d.authenticated === true && sender?.active === true;
  return { ok, pending: !ok, detail: ok ? `${domain} authenticated · ${pushed.detail}` : `${pushed.detail} · waiting for Brevo DNS/sender verification` };
}