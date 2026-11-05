type HealthCheck = { kind?: string; ok: boolean };

/** Only a matching affirmative result can establish success. */
export function providerCheckState(checks: readonly HealthCheck[] | null, kind: string, pending: boolean) {
  if (pending) return "pending";
  const matches = checks?.filter(check => check.kind === kind) ?? [];
  if (matches.some(check => !check.ok)) return "issue";
  if (matches.length) return "success";
  return "unknown";
}