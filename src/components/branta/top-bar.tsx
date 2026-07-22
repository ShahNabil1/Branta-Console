import { Link, useRouterState } from "@tanstack/react-router";
import { ProfileMenu } from "@/components/branta/profile-menu";
import { NotificationsBell } from "@/components/branta/notifications-bell";

const CRUMB_LABELS: Record<string, string> = {
  app: "Workspace",
  leads: "Leads",
  settings: "Settings",
};

function labelFor(seg: string) {
  return CRUMB_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function TopBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Build (label, href) pairs. Href accumulates ALL original segments so
  // deep-nested routes still resolve; UUID-like segments are hidden from
  // the visible crumb list but remain part of the href for anything nested
  // below them.
  const rawSegments = pathname.split("/").filter(Boolean);
  const crumbs: { seg: string; href: string }[] = [];
  let acc = "";
  for (const seg of rawSegments) {
    acc += "/" + seg;
    if (UUID_RE.test(seg)) continue;
    crumbs.push({ seg, href: acc });
  }

  return (
    <header className="hairline-b flex h-14 shrink-0 items-center justify-between bg-card px-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-[13px]" aria-label="Breadcrumb">
        {crumbs.length === 0 ? (
          <span className="font-medium text-foreground">Workspace</span>
        ) : (
          crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span key={i} className="flex items-center gap-2">
                {isLast ? (
                  <span className="font-medium text-foreground">
                    {labelFor(c.seg)}
                  </span>
                ) : (
                  <Link
                    to={c.href}
                    className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground hover:underline"
                  >
                    {labelFor(c.seg)}
                  </Link>
                )}
                {!isLast && <span className="text-border">/</span>}
              </span>
            );
          })
        )}
      </nav>



      {/* Cmd-K + notifications */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const evt = new KeyboardEvent("keydown", {
              key: "k",
              metaKey: true,
              bubbles: true,
            });
            window.dispatchEvent(evt);
          }}
          className="hairline flex h-8 cursor-pointer items-center gap-3 rounded-full border border-border bg-muted px-3 text-[12px] text-muted-foreground transition-colors hover:border-brand/30 hover:text-foreground active:scale-[0.98]"
        >
          <span>Search…</span>
          <kbd className="rounded-sm border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>
        <NotificationsBell />
        <ProfileMenu />
      </div>
    </header>
  );
}
