import { createFileRoute } from "@tanstack/react-router";
import { KpiTile } from "@/components/branta/kpi-tile";
import { StatusDot } from "@/components/branta/status-dot";
import { KPIS, LEADS, ACTIVITY } from "@/lib/mock-data";

export const Route = createFileRoute("/_authenticated/app/")({
  component: Dashboard,
});

const DOT_CLASS = {
  brand: "bg-brand",
  converted: "bg-emerald-500",
  muted: "bg-zinc-300",
} as const;

function Dashboard() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      {/* Page header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-foreground">
            Overview
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Live snapshot of pipeline and team activity.
          </p>
        </div>
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Updated · just now
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPIS.map((k) => (
          <KpiTile key={k.label} {...k} />
        ))}
      </div>

      {/* Leads preview */}
      <section className="overflow-hidden rounded-md border border-border bg-card shadow-[var(--shadow-hairline)]">
        <div className="hairline-b flex h-10 items-center justify-between bg-muted/60 px-4">
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-semibold">Recent Leads</span>
            <span className="h-3.5 w-px bg-border" />
            <span className="text-[11px] text-muted-foreground">
              Sorted by last activity
            </span>
          </div>
          <a
            href="/app/leads"
            className="text-[11px] font-semibold text-brand hover:underline underline-offset-4"
          >
            View all →
          </a>
        </div>

        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="hairline-b">
              {["Name", "Company", "Status", "Owner", "Last Activity", "Next Action"].map(
                (h, i) => (
                  <th
                    key={h}
                    className={
                      "h-9 px-4 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground " +
                      (i === 5 ? "text-right" : "")
                    }
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {LEADS.map((lead) => (
              <tr
                key={lead.id}
                className="group h-10 transition-colors hover:bg-muted/50"
              >
                <td className="px-4 text-[13px] font-medium text-foreground">
                  {lead.name}
                </td>
                <td className="px-4 text-[13px] text-muted-foreground">
                  {lead.company}
                </td>
                <td className="px-4">
                  <StatusDot status={lead.status} />
                </td>
                <td className="px-4">
                  <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <span className="grid size-5 place-items-center rounded-full bg-muted text-[9px] font-bold text-foreground">
                      {lead.ownerInitials}
                    </span>
                    {lead.ownerName}
                  </span>
                </td>
                <td className="px-4 font-mono text-[12px] text-muted-foreground">
                  {lead.lastActivity}
                </td>
                <td className="px-4 text-right">
                  <button className="text-[11px] font-semibold text-brand hover:underline underline-offset-4">
                    {lead.nextAction}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Activity */}
      <section className="rounded-md border border-border bg-card shadow-[var(--shadow-hairline)]">
        <div className="hairline-b flex h-10 items-center px-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Recent Activity
          </span>
        </div>
        <div className="space-y-4 p-4">
          {ACTIVITY.map((a) => (
            <div key={a.id} className="flex gap-3">
              <div
                className={
                  "mt-1.5 size-2 shrink-0 rounded-full " + DOT_CLASS[a.dot]
                }
              />
              <div>
                <p className="text-[13px] text-foreground">{a.body}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{a.meta}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
