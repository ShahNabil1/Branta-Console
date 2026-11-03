import { Bell, Check, Trash2, MailX } from "lucide-react";
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
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 overflow-hidden p-0"
      >
        <div className="hairline-b flex items-center justify-between px-3 py-2">
          <div className="text-[12px] font-semibold">Notifications</div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => notifications.markAllRead()}
              disabled={unread === 0}
              className="flex cursor-pointer items-center gap-1 rounded-sm px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              title="Mark all as read"
            >
              <Check className="size-3" /> Read
            </button>
            <button
              type="button"
              onClick={() => notifications.clear()}
              disabled={list.length === 0}
              className="flex cursor-pointer items-center gap-1 rounded-sm px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              title="Clear all"
            >
              <Trash2 className="size-3" /> Clear
            </button>
          </div>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <div className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
                <Bell className="size-4" strokeWidth={1.75} />
              </div>
              <div className="text-[13px] font-medium">No notifications</div>
              <div className="text-[11px] text-muted-foreground">
                You're all caught up.
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "group flex cursor-pointer items-start gap-2 px-3 py-2.5 transition-colors hover:bg-muted",
                    !n.read && "bg-brand-50/40",
                  )}
                  onClick={() => {
                    if (n.href) navigate({ to: n.href });
                  }}
                >
                  <div
                    className={cn(
                      "mt-0.5 grid size-6 shrink-0 place-items-center rounded-sm",
                      n.kind === "email_failed"
                        ? "bg-red-50 text-red-600"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {n.kind === "email_failed" ? (
                      <MailX className="size-3.5" />
                    ) : (
                      <Bell className="size-3.5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-[12px] font-medium">
                        {n.title}
                      </div>
                      <div className="shrink-0 text-[10px] text-muted-foreground">
                        {timeAgo(n.createdAt)}
                      </div>
                    </div>
                    {n.description && (
                      <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        {n.description}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      notifications.remove(n.id);
                    }}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Dismiss"
                  >
                    <Trash2 className="size-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
