import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, Clock, Loader2, MousePointerClick, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getTrackerOverview, requestManualScreenshot, saveTrackerSettings, type TrackerSettingRow } from "@/lib/tracker-admin.functions";

export const Route = createFileRoute("/_authenticated/app/tracker-settings")({
  head: () => ({
    meta: [
      { title: "Extension Settings · Branta Console" },
      { name: "description", content: "Per-employee Branta Tracker screenshot interval, idle threshold and manual capture." },
      { property: "og:title", content: "Extension Settings · Branta Console" },
      { property: "og:description", content: "Configure Branta Tracker for each employee." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const initials = (n: string) => n.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

function NumField({ label, value, onChange, icon }: { label: string; value: number; onChange: (n: number) => void; icon: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{icon}{label}</span>
      <div className="flex h-8 items-center rounded border bg-background">
        <input type="number" min={1} max={60} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-14 bg-transparent px-2 font-mono text-sm outline-none" />
        <span className="pr-2 text-xs text-muted-foreground">min</span>
      </div>
    </label>
  );
}

function Page() {
  const fetch = useServerFn(getTrackerOverview);
  const save = useServerFn(saveTrackerSettings);
  const shoot = useServerFn(requestManualScreenshot);
  const q = useQuery({ queryKey: ["tracker-settings"], queryFn: () => fetch() });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState({ interval: 3, idle: 5 });
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => (q.data?.employees ?? []).filter((e) => (e.name + e.email).toLowerCase().includes(search.toLowerCase())), [q.data, search]);

  const apply = async (ids: string[] | "all", intervalMinutes: number, idleMinutes: number) => {
    setBusy(true);
    try { await save({ data: { ids, intervalMinutes, idleMinutes } }); toast.success("Settings saved"); await q.refetch(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Extension Settings</h1>
        <p className="text-xs text-muted-foreground">Branta Tracker rules per employee. New values apply at the employee's next Check In.</p>
      </div>

      <section className="rounded border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">Global / Bulk Rule</div>
          <span className="text-xs text-muted-foreground">{selected.size ? `${selected.size} selected` : "Applies to everyone"}</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <NumField label="Screenshot every" icon={<Camera className="size-3" />} value={bulk.interval} onChange={(v) => setBulk({ ...bulk, interval: v })} />
          <NumField label="Idle after" icon={<Clock className="size-3" />} value={bulk.idle} onChange={(v) => setBulk({ ...bulk, idle: v })} />
          <Button size="sm" disabled={busy} onClick={() => apply(selected.size ? [...selected] : "all", bulk.interval, bulk.idle)}>
            {busy && <Loader2 className="size-3 animate-spin" />}{selected.size ? `Apply to ${selected.size}` : "Apply to All"}
          </Button>
          {selected.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>}
        </div>
      </section>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees" className="h-9 w-full rounded border bg-card pl-8 pr-3 text-sm outline-none focus:border-primary" />
      </div>

      {q.isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</div>
        : q.error ? <div className="text-sm text-destructive">{(q.error as Error).message}</div>
        : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map((e) => (
            <EmployeeCard key={e.id} e={e} checked={selected.has(e.id)} onCheck={() => toggle(e.id)}
              onSave={(i, d) => apply([e.id], i, d)}
              onShot={async () => { try { await shoot({ data: { id: e.id } }); toast.success(`Capture requested for ${e.name}`, { description: "Taken within ~30 seconds if the extension is on and checked in." }); } catch (x) { toast.error((x as Error).message); } }} />
          ))}</div>}
    </div>
  );
}

function EmployeeCard({ e, checked, onCheck, onSave, onShot }: { e: TrackerSettingRow; checked: boolean; onCheck: () => void; onSave: (i: number, d: number) => void; onShot: () => void }) {
  const [interval, setInterval] = useState(e.intervalMinutes);
  const [idle, setIdle] = useState(e.idleMinutes);
  const dirty = interval !== e.intervalMinutes || idle !== e.idleMinutes;
  return (
    <div className={cn("rounded border bg-card p-4 transition-colors", checked && "border-primary ring-1 ring-primary/30", !e.active && "opacity-60")}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={checked} onChange={onCheck} className="mt-1 accent-primary" aria-label={`Select ${e.name}`} />
        {e.avatar ? <img src={e.avatar} alt="" className="size-10 rounded-full object-cover" />
          : <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials(e.name)}</div>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{e.name}</div>
          <div className="truncate text-xs text-muted-foreground">{e.email}</div>
          {e.role && <span className="mt-1 inline-block rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{e.role}</span>}
        </div>
        {!e.active && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">Deactive</span>}
      </div>
      <div className="mt-4 flex items-end gap-3">
        <NumField label="Screenshot" icon={<Camera className="size-3" />} value={interval} onChange={setInterval} />
        <NumField label="Idle after" icon={<Clock className="size-3" />} value={idle} onChange={setIdle} />
      </div>
      <div className="mt-4 flex gap-2 border-t pt-3">
        <Button size="sm" variant="outline" className="flex-1" disabled={!e.active} onClick={onShot}><MousePointerClick className="size-3.5" />Capture Now</Button>
        <Button size="sm" className="flex-1" disabled={!dirty} onClick={() => onSave(interval, idle)}>Save</Button>
      </div>
    </div>
  );
}
