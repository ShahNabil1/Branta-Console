// Pure Resend domain tracking health rules (shared by Test, Fix and one-click setup).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type TrackingIssue = "subdomain" | "open" | "click" | "tls" | "dns";

/** Every reason the domain can't deliver open/click webhook events. */
export function trackingIssues(d: Any): TrackingIssue[] {
  const out: TrackingIssue[] = [];
  if (!d?.tracking_subdomain) out.push("subdomain");
  if (d?.open_tracking !== true) out.push("open");
  if (d?.click_tracking !== true) out.push("click");
  if (String(d?.tls ?? "opportunistic") !== "opportunistic") out.push("tls");
  const recs = (d?.records ?? []) as Any[];
  if (d?.tracking_subdomain && recs.some((r) => String(r.status ?? "").toLowerCase() !== "verified")) out.push("dns");
  return out;
}

export const ISSUE_LABEL: Record<TrackingIssue, string> = {
  subdomain: "tracking subdomain missing",
  open: "open tracking off",
  click: "click tracking off",
  tls: "TLS not opportunistic",
  dns: "tracking DNS not verified",
};

export const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
