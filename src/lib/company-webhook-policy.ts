/** Exact company endpoint matching; Brevo's private token never leaves the server. */
export function ownedWebhookAddress(address: string, expected: string): string | null {
  try {
    const url = new URL(address);
    const base = new URL(expected);
    if (url.origin !== base.origin || url.pathname.replace(/\/+$/, "") !== base.pathname.replace(/\/+$/, "")) return null;
    if (url.searchParams.getAll("company").length !== 1 || url.searchParams.get("company") !== base.searchParams.get("company")) return null;
    if ([...url.searchParams.keys()].some((key) => key !== "company" && key !== "token")) return null;
    return base.toString();
  } catch { return null; }
}

export function sameWebhookIds(current: string[], confirmed: string[]): boolean {
  return current.length === confirmed.length && new Set(confirmed).size === confirmed.length && current.every((id) => confirmed.includes(id));
}