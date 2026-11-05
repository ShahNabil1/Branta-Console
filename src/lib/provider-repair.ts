export type RepairResponse = { ok: boolean; status: number; body: any };
type Call = (path: string, init?: { method?: string; body?: unknown }) => Promise<RepairResponse>;
function requireOk(r: RepairResponse) {
  if (!r.ok) throw new Error(`Provider ${r.status}: ${r.body?.message ?? "request failed"}`);
  return r.body;
}

export async function repairResendDomain(domain: string, subdomain: string, call: Call, push: (records: any[]) => Promise<{ ok: boolean; detail: string }>) {
  const list = requireOk(await call("/domains"));
  let d = (list?.data ?? []).find((item: any) => String(item.name).toLowerCase() === domain);
  if (!d) d = requireOk(await call("/domains", { method: "POST", body: { name: domain } }));
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