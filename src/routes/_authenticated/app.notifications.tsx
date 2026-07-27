import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, Loader2, Megaphone, ShieldCheck } from "lucide-react";
import { RequireSuperAdmin } from "@/components/branta/require-super-admin";
import {
  broadcastTelegramMessage,
  listNotificationRules,
  updateNotificationRule,
} from "@/lib/notifications.functions";
import {
  EVENT_CATALOG,
  EVENT_GROUPS,
  EVENT_GROUP_LABEL,
  NOTIFICATION_ROLES,
  NOTIFICATION_ROLE_LABEL,
  type NotificationRole,
} from "@/lib/notification-events";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/app/notifications")({
  head: () => ({ meta: [{ title: "Notification rules · Admin" }] }),
  component: () => (
    <RequireSuperAdmin>
      <NotificationRulesPage />
    </RequireSuperAdmin>
  ),
});

type Rule = {
  event_key: string;
  enabled: boolean;
  role_super_admin: boolean;
  role_admin: boolean;
  role_finance: boolean;
  role_employee: boolean;
};

const ROLE_COL: Record<NotificationRole, keyof Rule> = {
  super_admin: "role_super_admin",
  admin: "role_admin",
  finance: "role_finance",
  employee: "role_employee",
};

function NotificationRulesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotificationRules);
  const updateFn = useServerFn(updateNotificationRule);
  const broadcastFn = useServerFn(broadcastTelegramMessage);
  const q = useQuery({
    queryKey: ["notification-rules"],
    queryFn: () => listFn(),
  });

  const rulesByKey = useMemo(() => {
    const m = new Map<string, Rule>();
    for (const r of (q.data?.rules ?? []) as Rule[]) m.set(r.event_key, r);
    return m;
  }, [q.data]);

  const save = useMutation({
    mutationFn: (patch: Partial<Rule> & { event_key: string }) =>
      updateFn({ data: patch }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["notification-rules"] }),
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const [msg, setMsg] = useState("");
  const [roles, setRoles] = useState<Set<NotificationRole>>(
    new Set(["super_admin", "admin"]),
  );
  const broadcast = useMutation({
    mutationFn: () =>
      broadcastFn({ data: { message: msg, roles: Array.from(roles) } }),
    onSuccess: (r) => {
      toast.success(`Broadcast sent (${r.sent} delivered, ${r.skipped} skipped)`);
      setMsg("");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Broadcast failed"),
  });

  return (
    <div className="space-y-5 p-5">
      <header className="flex items-start gap-3">
        <div className="grid size-10 place-items-center rounded-md bg-brand/10 text-brand">
          <Bell className="size-5" />
        </div>
        <div>
          <h1 className="text-[15px] font-semibold text-foreground">
            Notification rules
          </h1>
          <p className="text-[12.5px] text-muted-foreground">
            Control which events send Telegram notifications, and to which
            role tiers. Individual users can still opt out of non-critical
            categories in Profile → Security.
          </p>
        </div>
      </header>

      {q.isLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card p-4 text-[12px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-5">
          {EVENT_GROUPS.map((group) => {
            const events = EVENT_CATALOG.filter((e) => e.group === group);
            if (events.length === 0) return null;
            return (
              <section
                key={group}
                className="overflow-hidden rounded-md border border-border bg-card"
              >
                <header className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-3.5 text-muted-foreground" />
                    <div className="text-[12.5px] font-semibold text-foreground">
                      {EVENT_GROUP_LABEL[group]}
                    </div>
                  </div>
                  <div className="hidden gap-6 text-[10.5px] uppercase tracking-wide text-muted-foreground sm:flex">
                    <span className="w-16 text-center">Enabled</span>
                    {NOTIFICATION_ROLES.map((r) => (
                      <span key={r} className="w-16 text-center">
                        {NOTIFICATION_ROLE_LABEL[r]}
                      </span>
                    ))}
                  </div>
                </header>
                <div className="divide-y divide-border">
                  {events.map((ev) => {
                    const rule = rulesByKey.get(ev.key);
                    if (!rule) return null;
                    const alwaysOn = ev.alwaysOn;
                    return (
                      <div
                        key={ev.key}
                        className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
                            {ev.label}
                            {alwaysOn && (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700">
                                always on
                              </span>
                            )}
                          </div>
                          <div className="text-[11.5px] text-muted-foreground">
                            {ev.description}
                          </div>
                          <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground/70">
                            {ev.key}
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="flex w-16 justify-center">
                            <Switch
                              checked={rule.enabled}
                              onCheckedChange={(v) =>
                                save.mutate({
                                  event_key: ev.key,
                                  enabled: v,
                                })
                              }
                            />
                          </div>
                          {NOTIFICATION_ROLES.map((r) => (
                            <div key={r} className="flex w-16 justify-center">
                              <Switch
                                checked={rule[ROLE_COL[r]] as boolean}
                                disabled={!rule.enabled}
                                onCheckedChange={(v) =>
                                  save.mutate({
                                    event_key: ev.key,
                                    [ROLE_COL[r]]: v,
                                  } as Partial<Rule> & { event_key: string })
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <section className="rounded-md border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="grid size-10 place-items-center rounded-md bg-brand/10 text-brand">
            <Megaphone className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-foreground">
              Broadcast Telegram message
            </div>
            <p className="text-[12px] text-muted-foreground">
              Send a one-off message to everyone in the selected role tiers.
              HTML allowed (b, i, code, a).
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {NOTIFICATION_ROLES.map((r) => {
                const on = roles.has(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      const next = new Set(roles);
                      if (on) next.delete(r);
                      else next.add(r);
                      setRoles(next);
                    }}
                    className={
                      "rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition-colors " +
                      (on
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-border bg-muted/40 text-muted-foreground hover:text-foreground")
                    }
                  >
                    {NOTIFICATION_ROLE_LABEL[r]}
                  </button>
                );
              })}
            </div>
            <Textarea
              className="mt-3 min-h-24"
              placeholder="Message body…"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
            />
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                size="sm"
                disabled={
                  broadcast.isPending || msg.trim().length === 0 || roles.size === 0
                }
                onClick={() => broadcast.mutate()}
              >
                {broadcast.isPending ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Megaphone className="mr-1.5 size-3.5" />
                )}
                Send broadcast
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
