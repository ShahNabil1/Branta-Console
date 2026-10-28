import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, Clock, Eye, Loader2, MousePointerClick, PlugZap, Search, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getEmployeeScreenshots, getTrackerOverview, requestManualScreenshot, saveTrackerSettings, type TrackerSettingRow, type TrackerShot } from "@/lib/tracker-admin.functions";

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
  const listShots = useServerFn(getEmployeeScreenshots);
  const q = useQuery({ queryKey: ["tracker-settings"], queryFn: () => fetch(), refetchInterval: 15_000 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulkRaw] = useState({ interval: 3, idle: 5 });
  const [bulkDirty, setBulkDirty] = useState(false);
  const setBulk = (v: { interval: number; idle: number }) => { setBulkRaw(v); setBulkDirty(true); };
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<TrackerSettingRow | null>(null);
  const [capturing, setCapturing] = useState<string | null>(null);
  const rows = useMemo(() => (q.data?.employees ?? []).filter((e) => (e.name + e.email).toLowerCase().includes(search.toLowerCase())), [q.data, search]);

  const apply = async (ids: string[] | "all", intervalMinutes: number, idleMinutes: number) => {
    setBusy(true);
    try { await save({ data: { ids, intervalMinutes, idleMinutes } }); toast.success("Settings saved"); await q.refetch(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Request a capture, then watch for the new screenshot (the extension checks every ~30s).
  const capture = async (e: TrackerSettingRow) => {
    setCapturing(e.id);
    try {
      const before = (await listShots({ data: { id: e.id } })).shots[0]?.capturedAt ?? "";
      const t0 = new Date().toISOString();
      await shoot({ data: { id: e.id } });
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const latest = (await listShots({ data: { id: e.id } })).shots[0];
        if (latest && Date.parse(latest.capturedAt) > (before ? Date.parse(before) : 0) && Date.parse(latest.capturedAt) >= Date.parse(t0) - 5000) {
          toast.success(`Screenshot captured for ${e.name}`, { action: { label: "View", onClick: () => setViewing(e) } });
          await q.refetch();
          return;
        }
      }
      toast.error("No screenshot arrived", { description: "Extension v0.7.0 is needed, and Chrome must not be minimized or on a Chrome system page." });
    } catch (x) { toast.error((x as Error).message); } finally { setCapturing(null); }
  };
  const counts = useMemo(() => {
    const all = q.data?.employees ?? [];
    return { active: all.filter((e) => e.status === "active").length, idle: all.filter((e) => e.status === "idle").length, setup: all.filter((e) => e.setup).length, total: all.length };
  }, [q.data]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-4 p-4 pt-14 md:p-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Extension Settings</h1>
        <p className="text-xs text-muted-foreground">Branta Tracker rules per employee · <span className="font-mono">{counts.active}</span> Active Now · <span className="font-mono">{counts.idle}</span> Idle · <span className="font-mono">{counts.setup}/{counts.total}</span> Setup Done</p>
      </div>

      <section className="rounded border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium">Global / Bulk Rule</div>
          <span className="text-xs text-muted-foreground">{selected.size ? `${selected.size} selected` : "Applies to everyone"}</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <NumField label="Screenshot every" icon={<Camera className="size-3" />} value={bulk.interval} onChange={(v) => setBulk({ ...bulk, interval: v })} />
          <NumField label="Idle after" icon={<Clock className="size-3" />} value={bulk.idle} onChange={(v) => setBulk({ ...bulk, idle: v })} />
          <Button size="sm" disabled={busy || !bulkDirty || bulk.interval < 1 || bulk.idle < 1} onClick={async () => { await apply(selected.size ? [...selected] : "all", bulk.interval, bulk.idle); setBulkDirty(false); }}>
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
        : <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-3">{rows.map((e) => (
            <EmployeeCard key={`${e.id}-${e.intervalMinutes}-${e.idleMinutes}`} e={e} checked={selected.has(e.id)} onCheck={() => toggle(e.id)}
              onSave={(i, d) => apply([e.id], i, d)}
              onView={() => setViewing(e)}
              onShot={() => capture(e)} capturing={capturing === e.id} />
          ))}</div>}
      <ShotsDialog employee={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

const STATUS = {
  active: { label: "Active Now", dot: "bg-[hsl(142_70%_45%)]", text: "text-[hsl(142_70%_35%)]" },
  idle: { label: "Idle", dot: "bg-[hsl(38_92%_50%)]", text: "text-[hsl(38_92%_40%)]" },
  inactive: { label: "Inactive", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
} as const;

const dhaka = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
const ago = (iso: string | null) => {
  if (!iso) return "Never";
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
};

function EmployeeCard({ e, checked, onCheck, onSave, onShot, onView, capturing }: { e: TrackerSettingRow; checked: boolean; onCheck: () => void; onSave: (i: number, d: number) => void; onShot: () => void; onView: () => void; capturing: boolean }) {
  const [interval, setInterval] = useState(e.intervalMinutes);
  const [idle, setIdle] = useState(e.idleMinutes);
  const dirty = interval !== e.intervalMinutes || idle !== e.idleMinutes;
  const st = STATUS[e.status];
  return (
    <div className={cn("rounded border bg-card p-4 transition-colors", checked && "border-primary ring-1 ring-primary/30", !e.active && "opacity-60")}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={checked} onChange={onCheck} className="mt-1 accent-primary" aria-label={`Select ${e.name}`} />
        <div className="relative shrink-0">
          {e.avatar ? <img src={e.avatar} alt="" className="size-10 rounded-full object-cover" />
            : <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{initials(e.name)}</div>}
          <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card", st.dot, e.status === "active" && "animate-pulse")} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{e.name}</div>
          <div className="truncate text-xs text-muted-foreground">{e.email}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", st.text)}><span className={cn("size-1.5 rounded-full", st.dot)} />{st.label}</span>
            <span className="text-[10px] text-muted-foreground">· {ago(e.lastSeenAt)}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {!e.active && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">Deactive</span>}
          {e.setup
            ? <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-[hsl(142_70%_35%)]"><PlugZap className="size-3" />Setup Done</span>
            : <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"><Unplug className="size-3" />Not Setup</span>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <NumField label="Screenshot" icon={<Camera className="size-3" />} value={interval} onChange={setInterval} />
        <NumField label="Idle after" icon={<Clock className="size-3" />} value={idle} onChange={setIdle} />
        <Button size="sm" className="ml-auto shrink-0" disabled={!dirty} onClick={() => onSave(interval, idle)}>Save</Button>
      </div>
      <div className="mt-4 flex gap-2 border-t pt-3">
        <Button size="sm" variant="outline" className="flex-1" disabled={!e.connected || capturing} onClick={onShot}
          title={e.connected ? "Capture the employee's screen now" : "Available only while the extension is connected"}>
          {capturing ? <Loader2 className="size-3.5 animate-spin" /> : <MousePointerClick className="size-3.5" />}{capturing ? "Capturing…" : "Capture Now"}
        </Button>
        <Button size="sm" variant="outline" className="flex-1" disabled={!e.setup} onClick={onView}>
          <Eye className="size-3.5" />View{e.shotsToday ? ` (${e.shotsToday})` : ""}
        </Button>
      </div>
    </div>
  );
}

function ShotsDialog({ employee, onClose }: { employee: TrackerSettingRow | null; onClose: () => void }) {
  const list = useServerFn(getEmployeeScreenshots);
  const [zoom, setZoom] = useState<TrackerShot | null>(null);
  const q = useQuery({
    queryKey: ["tracker-shots", employee?.id],
    queryFn: () => list({ data: { id: employee!.id } }),
    enabled: !!employee,
    refetchInterval: 20_000,
  });
  const shots = q.data?.shots ?? [];
  return (
    <Dialog open={!!employee} onOpenChange={(o) => { if (!o) { setZoom(null); onClose(); } }}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee?.name} · Screenshots</DialogTitle>
        </DialogHeader>
        {zoom ? (
          <div className="space-y-2">
            <Button size="sm" variant="ghost" onClick={() => setZoom(null)}>← Back to all</Button>
            <img src={zoom.url} alt="" className="w-full rounded border" />
            <div className="font-mono text-xs text-muted-foreground">{dhaka(zoom.capturedAt)} · {zoom.sizeKb} KB</div>
          </div>
        ) : q.isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</div>
          : !shots.length ? <div className="py-10 text-center text-sm text-muted-foreground">No screenshots yet.</div>
          : <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{shots.map((s) => (
              <button key={s.id} onClick={() => setZoom(s)} className="group overflow-hidden rounded border bg-muted text-left hover:border-primary">
                <img src={s.url} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                <div className="flex justify-between px-2 py-1 font-mono text-[10px] text-muted-foreground"><span>{dhaka(s.capturedAt)}</span><span>{s.sizeKb} KB</span></div>
              </button>
            ))}</div>}
      </DialogContent>
    </Dialog>
  );
}
