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
          <span className="rounded-full bg-brand/10 px-2.5 py-1 font-semibold text-brand">Workspace</span>
        ) : (
          crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span key={i} className={i < crumbs.length - 2 ? "hidden items-center gap-2 sm:flex" : "flex min-w-0 items-center gap-2"}>
                {isLast ? (
                  <span className="truncate rounded-full bg-brand/10 px-2.5 py-1 font-semibold text-brand ring-1 ring-inset ring-brand/20 animate-in fade-in slide-in-from-left-1">
                    {labelFor(c.seg)}
                  </span>
                ) : (
                  <Link
                    to={c.href as unknown as "/app"}
                    className="cursor-pointer rounded-full px-2 py-1 font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                  >
                    {labelFor(c.seg)}
                  </Link>
                )}
                {!isLast && <span className="text-muted-foreground/40">›</span>}
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
          className="group grid size-8 cursor-pointer place-items-center rounded-full border border-border bg-muted/60 text-[12px] text-muted-foreground transition-all hover:-translate-y-px hover:border-brand/40 hover:bg-card hover:text-foreground hover:shadow-md hover:shadow-brand/10 active:scale-95 sm:flex sm:h-9 sm:w-56 sm:justify-between sm:gap-3 sm:px-3"
          aria-label="Search"
        >
          <Search className="size-4 sm:hidden" />
          <span className="hidden items-center gap-2 sm:inline-flex"><Search className="size-3.5 transition-colors group-hover:text-brand" />Search…</span>
          <kbd className="hidden rounded-md border border-border bg-card px-1.5 py-0.5 font-mono shadow-sm transition-colors group-hover:border-brand/40 group-hover:text-brand text-[10px] text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </button>
        <NotificationsBell />
        <ProfileMenu />
      </div>
    </header>
  );
}
