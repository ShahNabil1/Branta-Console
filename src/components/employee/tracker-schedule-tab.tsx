import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTrackerSchedule, saveTrackerSchedule } from "@/lib/tracker-schedule.functions";
import { DAY_LABELS, type ShiftSchedule } from "@/lib/tracker-schedule";

const ORDER = ["6", "0", "1", "2", "3", "4", "5"] as const; // Saturday-first week

export function TrackerScheduleTab({ userId }: { userId: string }) {
  const getFn = useServerFn(getTrackerSchedule);
  const saveFn = useServerFn(saveTrackerSchedule);
  const [schedule, setSchedule] = useState<ShiftSchedule | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getFn({ data: { userId } })
      .then((r) => setSchedule(r.schedule))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load schedule"));
  }, [userId, getFn]);

  if (!schedule) return <div className="p-6 text-sm text-muted-foreground">Loading Shift schedule…</div>;

  const setDay = (d: string, slots: ShiftSchedule["days"][string]) =>
    setSchedule({ ...schedule, days: { ...schedule.days, [d]: slots } });

  const copyToAll = (d: string) => {
    const src = schedule.days[d] ?? [];
    setSchedule({ ...schedule, days: Object.fromEntries(ORDER.map((k) => [k, src.map((s) => ({ ...s }))])) as ShiftSchedule["days"] });
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveFn({ data: { userId, schedule } });
      toast.success("Shift schedule saved. Branta Tracker updates within a minute.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-[4px] border border-border bg-card p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h3 className="text-sm font-semibold">Tracker Shift Schedule</h3>
          <p className="text-xs text-muted-foreground">Shifts per day (Dhaka time). Leave a day empty for a day off.</p>
        </div>
        <label className="ml-auto text-xs">
          <span className="mb-1 block text-muted-foreground">Break per day (min)</span>
          <Input type="number" min={0} max={240} className="h-8 w-28 font-mono" value={schedule.break_minutes}
            onChange={(e) => setSchedule({ ...schedule, break_minutes: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">Grace (min)</span>
          <Input type="number" min={0} max={60} className="h-8 w-24 font-mono" value={schedule.grace_minutes}
            onChange={(e) => setSchedule({ ...schedule, grace_minutes: Math.max(0, Number(e.target.value) || 0) })} />
        </label>
      </div>
      <div className="divide-y divide-border rounded-[4px] border border-border">
        {ORDER.map((d) => {
          const slots = schedule.days[d] ?? [];
          return (
            <div key={d} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="w-24 text-xs font-medium">{DAY_LABELS[Number(d)]}</span>
              {slots.length === 0 && <span className="text-xs text-muted-foreground">Day off</span>}
              {slots.map((s, i) => (
                <div key={i} className="flex items-center gap-1 rounded-[4px] border border-border px-1.5 py-1">
                  <Input type="time" className="h-7 w-[104px] font-mono text-xs" value={s.start}
                    onChange={(e) => setDay(d, slots.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input type="time" className="h-7 w-[104px] font-mono text-xs" value={s.end}
                    onChange={(e) => setDay(d, slots.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                  <button type="button" aria-label="Remove shift" className="p-1 text-muted-foreground hover:text-destructive"
                    onClick={() => setDay(d, slots.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {slots.length < 4 && (
                <Button size="sm" variant="ghost" className="h-7 text-xs"
                  onClick={() => setDay(d, [...slots, { start: "15:00", end: "18:00" }])}><Plus className="mr-1 h-3.5 w-3.5" />Add Shift</Button>
              )}
              <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs text-muted-foreground" onClick={() => copyToAll(d)}>Copy to all days</Button>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Schedule"}</Button>
      </div>
    </section>
  );
}
