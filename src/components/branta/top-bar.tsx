import { Link, useRouterState } from "@tanstack/react-router";
import { ProfileMenu } from "@/components/branta/profile-menu";
import { NotificationsBell } from "@/components/branta/notifications-bell";
import { Search } from "lucide-react";

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
    <header className="hairline-b grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 bg-card pl-14 pr-3 sm:gap-4 sm:px-5 md:px-6">
      {/* Breadcrumbs */}
      <nav className="flex min-w-0 items-center gap-2 overflow-hidden text-[13px]" aria-label="Breadcrumb">
        {crumbs.length === 0 ? (
          <span className="font-medium text-foreground">Workspace</span>
        ) : (
          crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span key={i} className={i < crumbs.length - 2 ? "hidden items-center gap-2 sm:flex" : "flex min-w-0 items-center gap-2"}>
                {isLast ? (
                  <span className="truncate font-semibold text-foreground">
                    {labelFor(c.seg)}
                  </span>
                ) : (
                  <Link
                    to={c.href as unknown as "/app"}
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
       <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
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
          className="hairline grid size-8 cursor-pointer place-items-center rounded-sm border border-border bg-muted text-[12px] text-muted-foreground transition-colors hover:border-brand/30 hover:text-foreground active:scale-[0.98] sm:flex sm:w-auto sm:gap-3 sm:rounded-full sm:px-3"
          aria-label="Search"
        >
          <Search className="size-4 sm:hidden" />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="hidden rounded-sm border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </button>
        <NotificationsBell />
        <ProfileMenu />
      </div>
    </header>
  );
}
