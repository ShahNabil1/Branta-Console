/** Longest matching nav path wins, so /app/leads/dashboard never also lights up /app/leads. "/app" only matches exactly. */
export function resolveActivePath(pathname: string, paths: string[]): string | null {
  let best: string | null = null;
  for (const p of paths) {
    const match = pathname === p || (p !== "/app" && pathname.startsWith(`${p}/`));
    if (match && (!best || p.length > best.length)) best = p;
  }
  return best;
}
