import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getTrackerOverview, saveScreenshotInterval } from "@/lib/tracker-admin.functions";

export const Route = createFileRoute("/_authenticated/app/tracker-settings")({
  head: () => ({
    meta: [
      { title: "Extension Settings · Branta Console" },
      { name: "description", content: "Branta Tracker screenshot interval, live activity and screenshot previews." },
      { property: "og:title", content: "Extension Settings · Branta Console" },
      { property: "og:description", content: "Branta Tracker live monitoring and settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const STATUS: Record<string, string> = {
  active: "bg-success/15 text-success",
  idle: "bg-warning/15 text-warning",
  break: "bg-primary/15 text-primary",
  offline: "bg-muted text-muted-foreground",
  deactive: "bg-destructive/15 text-destructive",
};
const hm = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

function Page() {
  const fetchOverview = useServerFn(getTrackerOverview);
  const save = useServerFn(saveScreenshotInterval);
  const q = useQuery({ queryKey: ["tracker-overview"], queryFn: () => fetchOverview(), refetchInterval: 30_000 });
  const [minutes, setMinutes] = useState(3);
  const [zoom, setZoom] = useState<string | null>(null);
  useEffect(() => { if (q.data) setMinutes(q.data.intervalMinutes); }, [q.data?.intervalMinutes]);

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Extension Settings</h1>
      <section className="rounded border bg-card p-4">
        <div className="text-sm font-medium">Screenshot Interval</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="number" min={1} max={60} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="w-20 rounded border bg-background px-2 py-1 font-mono text-sm" />
          <span className="text-sm text-muted-foreground">minutes (≈ {Math.round(60 / Math.max(1, minutes))}/hour)</span>
          <Button size="sm" onClick={async () => { try { await save({ data: { minutes } }); toast.success("Saved"); q.refetch(); } catch (e) { toast.error((e as Error).message); } }}>Save</Button>
        </div>
      </section>
      {q.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : q.error ? <div className="text-sm text-destructive">{(q.error as Error).message}</div> : (
        <>
          <section className="overflow-x-auto rounded border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="p-2">Employee</th><th className="p-2">Status</th><th className="p-2">Worked</th><th className="p-2">Clicks</th><th className="p-2">Keys</th><th className="p-2">Last Seen</th></tr></thead>
              <tbody>{q.data!.employees.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-2">{e.name}</td>
                  <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs capitalize ${STATUS[e.status]}`}>{e.status}</span></td>
                  <td className="p-2 font-mono">{hm(e.workedSeconds)}</td>
                  <td className="p-2 font-mono">{e.clicks}</td>
                  <td className="p-2 font-mono">{e.keys}</td>
                  <td className="p-2 text-xs text-muted-foreground">{e.lastSeen ? new Date(e.lastSeen).toLocaleTimeString() : "—"}</td>
                </tr>))}</tbody>
            </table>
          </section>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {q.data!.screenshots.map((s) => (
              <button key={s.id} onClick={() => setZoom(s.url)} className="overflow-hidden rounded border bg-card text-left">
                {s.url ? <img src={s.url} alt={s.employee} className="aspect-video w-full object-cover" /> : <div className="aspect-video bg-muted" />}
                <div className="p-2 text-xs"><div className="font-medium">{s.employee}</div><div className="text-muted-foreground">{new Date(s.capturedAt).toLocaleString()} · {s.sizeKb} KB</div></div>
              </button>))}
            {q.data!.screenshots.length === 0 && <div className="text-sm text-muted-foreground">No screenshots yet.</div>}
          </section>
        </>
      )}
      {zoom && <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/80 p-4" onClick={() => setZoom(null)}><img src={zoom} alt="Screenshot" className="max-h-full max-w-full rounded" /></div>}
    </div>
  );
}
