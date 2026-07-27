import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Loader2, Send } from "lucide-react";
import {
  getMyNotificationPreferences,
  updateMyNotificationPreferences,
  sendTestTelegramNotification,
} from "@/lib/notifications.functions";
import { EVENT_GROUPS, EVENT_GROUP_LABEL } from "@/lib/notification-events";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Prefs = {
  group_leads: boolean;
  group_meetings: boolean;
  group_inbox: boolean;
  group_finance: boolean;
  group_security: boolean;
  group_system: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
  digest_mode: boolean;
};

const GROUP_KEY: Record<(typeof EVENT_GROUPS)[number], keyof Prefs> = {
  leads: "group_leads",
  meetings: "group_meetings",
  inbox: "group_inbox",
  finance: "group_finance",
  security: "group_security",
  system: "group_system",
};

export function NotificationPreferencesCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyNotificationPreferences);
  const setFn = useServerFn(updateMyNotificationPreferences);
  const testFn = useServerFn(sendTestTelegramNotification);
  const q = useQuery({
    queryKey: ["notification-prefs"],
    queryFn: () => getFn(),
  });
  const [local, setLocal] = useState<Prefs | null>(null);
  useEffect(() => {
    if (q.data?.prefs) setLocal(q.data.prefs as Prefs);
  }, [q.data]);

  const save = useMutation({
    mutationFn: (patch: Partial<Prefs>) => setFn({ data: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-prefs"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const test = useMutation({
    mutationFn: () => testFn(),
    onSuccess: (r) => {
      if (r.sent > 0) toast.success("Test notification sent to Telegram");
      else if (r.skipped > 0)
        toast.info("Skipped — link Telegram first, then try again.");
      else toast.error("Test failed to send.");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Test failed"),
  });

  const update = (patch: Partial<Prefs>) => {
    if (!local) return;
    setLocal({ ...local, ...patch });
    save.mutate(patch);
  };

  if (q.isLoading || !local) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-card p-4 text-[12px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading preferences…
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-brand/10 text-brand">
          <Bell className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-foreground">
            Telegram notification preferences
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Pick which categories you want on Telegram. Critical security
            alerts are always delivered.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {EVENT_GROUPS.map((g) => {
              const key = GROUP_KEY[g];
              const value = local[key] as boolean;
              return (
                <div
                  key={g}
                  className="flex items-center justify-between gap-3 rounded-sm border border-border bg-muted/30 px-3 py-2"
                >
                  <div className="text-[12.5px] font-medium text-foreground">
                    {EVENT_GROUP_LABEL[g]}
                    {g === "security" && (
                      <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                        (critical always on)
                      </span>
                    )}
                  </div>
                  <Switch
                    checked={value}
                    onCheckedChange={(v) => update({ [key]: v } as Partial<Prefs>)}
                  />
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-sm border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12.5px] font-medium text-foreground">
                  Quiet hours
                </div>
                <div className="text-[11.5px] text-muted-foreground">
                  Non-critical alerts pause during this window ({local.timezone})
                  and are delivered right after it ends.
                </div>

              </div>
              <Switch
                checked={local.quiet_hours_enabled}
                onCheckedChange={(v) => update({ quiet_hours_enabled: v })}
              />
            </div>
            {local.quiet_hours_enabled && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-sm">
                <div>
                  <Label className="text-[11px]">Start</Label>
                  <Input
                    type="time"
                    value={local.quiet_hours_start.slice(0, 5)}
                    onChange={(e) =>
                      update({ quiet_hours_start: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label className="text-[11px]">End</Label>
                  <Input
                    type="time"
                    value={local.quiet_hours_end.slice(0, 5)}
                    onChange={(e) =>
                      update({ quiet_hours_end: e.target.value })
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-sm border border-border bg-muted/30 px-3 py-2">
            <div>
              <div className="text-[12.5px] font-medium text-foreground">
                Digest mode
              </div>
              <div className="text-[11.5px] text-muted-foreground">
                Batch non-critical alerts into one message every 30 minutes.
              </div>
            </div>
            <Switch
              checked={local.digest_mode}
              onCheckedChange={(v) => update({ digest_mode: v })}
            />
          </div>



          <div className="mt-3 flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={test.isPending}
              onClick={() => test.mutate()}
            >
              {test.isPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 size-3.5" />
              )}
              Send test notification
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
