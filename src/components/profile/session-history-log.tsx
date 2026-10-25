import { History, MapPin } from "lucide-react";

export type SessionLogRow = {
  id: string;
  device: string | null;
  browser: string | null;
  os: string | null;
  ip: string | null;
  city: string | null;
  region?: string | null;
  country: string | null;
  revoked_at: string | null;
  logout_reason?: string | null;
};

export function logoutReasonLabel(r?: string | null) {
  switch (r) {
    case "idle_timeout":
      return { text: "Auto logout · inactivity", tone: "text-amber-700 bg-amber-50 border-amber-200" };
    case "manual_logout":
      return { text: "Signed out by user", tone: "text-muted-foreground bg-muted border-border" };
    case "revoked_by_admin":
      return { text: "Signed out by admin", tone: "text-rose-700 bg-rose-50 border-rose-200" };
    default:
      return { text: "Session revoked", tone: "text-muted-foreground bg-muted border-border" };
  }
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  });

/** Compact, read-only log of ended sessions — no actions. */
export function SessionHistoryLog({ rows }: { rows: SessionLogRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <History className="size-3.5" /> Logout log
      </div>
      <ul className="max-h-72 divide-y divide-border overflow-y-auto overscroll-contain rounded-sm border border-border">
        {rows.map((s) => {
          const r = logoutReasonLabel(s.logout_reason);
          const geo = [s.city, s.country].filter(Boolean).join(", ");
          return (
            <li key={s.id} className="min-w-0 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="min-w-0 break-words text-[12px] font-medium">
                  {s.browser ?? "Browser"} · {s.os ?? s.device ?? "Device"}
                </span>
                <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[10.5px] font-semibold ${r.tone}`}>
                  {r.text}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                {s.revoked_at && <span className="font-mono">{fmt(s.revoked_at)}</span>}
                {s.ip && <span className="font-mono">{s.ip}</span>}
                {geo && (
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin className="size-3" /> {geo}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
