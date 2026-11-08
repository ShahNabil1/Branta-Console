// Company-scoped URLs: Branta Tech (holding) lives at /app/..., every sister
// company at /app/org/<slug>/... . The URL is the source of truth for the company.
const ORG_RE = /^\/app\/org\/([^/]+)(\/.*)?$/;
/** Pages that exist per company. Everything else is holding-only. */
const SCOPED = [/^\/app\/operations\/?$/, /^\/app\/analytics\/?$/, /^\/app\/projects(\/|$)/, /^\/app\/tasks\/?$/, /^\/app\/?$/, /^\/app\/leads(\/|$)/, /^\/app\/customers(\/|$)/, /^\/app\/inbox(\/|$)/, /^\/app\/finance\/invoices(\/|$)/, /^\/app\/finance\/expenses(\/|$)/, /^\/app\/finance\/recycle-bin(\/|$)/, /^\/app\/my-company\/?$/];
const LAST_KEY = "branta.lastPath";

export function orgFromPath(pathname: string): string | null {
  return ORG_RE.exec(pathname)?.[1] ?? null;
}
/** /app/org/admakai/leads -> /app/leads (for menu highlighting and gates). */
export function stripOrg(pathname: string): string {
  const m = ORG_RE.exec(pathname);
  return m ? `/app${m[2] ?? ""}` : pathname;
}
export function isOrgScoped(pathname: string): boolean {
  return SCOPED.some((r) => r.test(pathname));
}
/** Same page in another company's workspace. */
export function toCompanyPath(pathname: string, slug: string, isHolding: boolean): string {
  const plain = stripOrg(pathname);
  if (!isOrgScoped(plain)) return isHolding ? "/app" : `/app/org/${slug}`;
  if (isHolding) return plain;
  return `/app/org/${slug}${plain.slice(4)}`;
}

export function rememberLastPath(href: string) {
  try { if (href.startsWith("/app")) localStorage.setItem(LAST_KEY, href); } catch { /* ignore */ }
}
export function lastPath(): string | null {
  try { const v = localStorage.getItem(LAST_KEY); return v && v.startsWith("/app") && !v.startsWith("//") ? v : null; } catch { return null; }
}
