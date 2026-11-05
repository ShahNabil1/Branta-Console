/** Provider repair order: API key → Domain → Tracking & TLS / Webhook. A later Fix stays disabled while an earlier step fails. */
export type FixKind = "api" | "domain" | "tracking" | "webhook";
const NEEDS: Record<FixKind, FixKind[]> = {
  api: [],
  domain: ["api"],
  tracking: ["api", "domain"],
  webhook: ["api"],
};
const LABEL: Record<FixKind, string> = { api: "API key", domain: "Domain", tracking: "Tracking & TLS", webhook: "Webhook" };

export function fixBlocker(kind: FixKind, checks: { kind?: string; ok: boolean }[]): string | null {
  const first = NEEDS[kind].find((k) => checks.some((c) => c.kind === k && !c.ok));
  return first ? `Fix ${LABEL[first]} first` : null;
}
