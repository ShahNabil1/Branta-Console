import { useRouterState } from "@tanstack/react-router";
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
  const segments = pathname
    .split("/")
    .filter(Boolean)
    // Hide raw UUIDs / long opaque IDs from the breadcrumb — they're never
    // meaningful to a reader. The page itself renders a human title.
    .filter((seg) => !UUID_RE.test(seg));

  return (
    <header className="hairline-b flex h-14 shrink-0 items-center justify-between bg-card px-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-[13px]" aria-label="Breadcrumb">
        {segments.length === 0 ? (
          <span className="font-medium text-foreground">Workspace</span>
        ) : (
          segments.map((seg, i) => {
            const isLast = i === segments.length - 1;
            return (
              <span key={i} className="flex items-center gap-2">
                <span
                  className={
                    isLast
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {labelFor(seg)}
                </span>
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
