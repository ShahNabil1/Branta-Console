import { Bell, Check, Trash2, MailX, UserCheck, ArrowLeftRight, CheckCircle2, X } from "lucide-react";
import { GmailMark } from "@/components/company/google-account-card";
import { useNavigate } from "@tanstack/react-router";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { notifications, useNotifications } from "@/lib/notifications-store";
import { cn } from "@/lib/utils";

function timeAgo(ts: number) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function visualFor(n: { kind: string; title: string }) {
  const t = n.title.toLowerCase();
  if (n.kind === "email_failed") return { Icon: MailX, cls: "bg-rose-500/10 text-rose-600 ring-rose-500/20", gmail: false };
  if (/repl|email|mail/.test(t)) return { Icon: Bell, cls: "bg-card ring-border", gmail: true };
  if (/transfer/.test(t)) return { Icon: ArrowLeftRight, cls: "bg-amber-500/10 text-amber-600 ring-amber-500/20", gmail: false };
  if (/assign/.test(t)) return { Icon: UserCheck, cls: "bg-sky-500/10 text-sky-600 ring-sky-500/20", gmail: false };
  if (n.kind === "success") return { Icon: CheckCircle2, cls: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20", gmail: false };
  return { Icon: Bell, cls: "bg-violet-500/10 text-violet-600 ring-violet-500/20", gmail: false };
}

export function NotificationsBell() {
  const list = useNotifications();
  const unread = list.filter((n) => !n.read).length;
  const navigate = useNavigate();

  return (
    <Popover
      onOpenChange={(open) => {
        if (open && unread > 0) notifications.markAllRead();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group relative grid size-9 cursor-pointer place-items-center rounded-full border border-border bg-card text-muted-foreground transition-all hover:-translate-y-px hover:border-brand/40 hover:bg-brand/10 hover:text-brand hover:shadow-md hover:shadow-brand/15 active:scale-90"
          aria-label="Notifications"
        >
          <Bell className="size-4 transition-transform group-hover:rotate-12" strokeWidth={1.75} />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 size-2 animate-pulse rounded-full bg-brand ring-2 ring-card" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[22rem] overflow-hidden rounded-xl border-border p-0 shadow-2xl shadow-foreground/10">
        <div className="relative flex items-center justify-between overflow-hidden px-4 py-3 hairline-b">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand via-amber-400 to-rose-500" />
          <div className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-brand/10 blur-2xl" />
          <div className="relative flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-brand/10 text-brand"><Bell className="size-3.5" strokeWidth={2} /></span>
            <div>
              <div className="text-[13px] font-semibold leading-tight">Notifications</div>
              <div className="text-[11px] text-muted-foreground">{list.length === 0 ? "Nothing new" : `${list.length} recent`}</div>
            </div>
          </div>
          <div className="relative flex items-center gap-1">
            <button type="button" onClick={() => notifications.markAllRead()} disabled={unread === 0} title="Mark all as read"
              className="flex cursor-pointer items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-all hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
              <Check className="size-3" /> Read
            </button>
            <button type="button" onClick={() => notifications.clear()} disabled={list.length === 0} title="Clear all"
              className="flex cursor-pointer items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-all hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40">
              <Trash2 className="size-3" /> Clear
            </button>
          </div>
        </div>
        <div className="max-h-[400px] overflow-y-auto p-1.5">
          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-sky-500/15 text-emerald-600">
                <CheckCircle2 className="size-5" strokeWidth={1.75} />
              </div>
              <div className="text-[13px] font-medium">You're all caught up</div>
              <div className="text-[11px] text-muted-foreground">New activity will appear here.</div>
            </div>
          ) : (
            <ul className="space-y-1">
              {list.map((n) => {
                const v = visualFor(n);
                return (
                  <li key={n.id} onClick={() => { if (n.href) navigate({ to: n.href }); }}
                    className={cn("group relative flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2.5 transition-all hover:-translate-y-px hover:bg-muted/70 hover:shadow-sm",
                      !n.read && "bg-gradient-to-r from-brand/[0.07] to-transparent")}>
                    {!n.read && <span className="absolute left-0.5 top-1/2 size-1.5 -translate-y-1/2 animate-pulse rounded-full bg-brand" />}
                    <div className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ring-1 transition-transform group-hover:scale-110", v.cls)}>
                      {v.gmail ? <GmailMark className="size-4" /> : <v.Icon className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-[12.5px] font-semibold">{n.title}</div>
                        <div className="shrink-0 font-mono text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</div>
                      </div>
                      {n.description && <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{n.description}</div>}
                    </div>
                    <button type="button" aria-label="Dismiss"
                      onClick={(e) => { e.stopPropagation(); notifications.remove(n.id); }}
                      className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-all hover:bg-rose-500/10 hover:text-rose-600 group-hover:opacity-100">
                      <X className="size-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
