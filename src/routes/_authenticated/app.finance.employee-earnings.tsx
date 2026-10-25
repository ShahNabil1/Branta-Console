import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getEmployeeEarningsOverview } from "@/lib/wallet-statement.functions";
import { WalletStatement, PeriodFilter, Stat, money, summarize, periodRange, inRange, dhakaDay, type Period } from "@/components/finance/wallet-statement";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/finance/employee-earnings")({
  head: () => ({
    meta: [
      { title: "Employee Earnings · Branta Console" },
      { name: "description", content: "Employee wallet balances, earnings and Employee Fund usage by project." },
      { property: "og:title", content: "Employee Earnings · Branta Console" },
      { property: "og:description", content: "Employee wallet balances, earnings and Employee Fund usage by project." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmployeeEarningsPage,
});

type Group = "day" | "week" | "month" | "employee" | "project" | "client" | "type";

function EmployeeEarningsPage() {
  const fn = useServerFn(getEmployeeEarningsOverview);
  const q = useQuery({ queryKey: ["employee-earnings-overview"], queryFn: () => fn(), staleTime: 30_000 });
  const [sel, setSel] = useState<string | null>(null);
  const [p, setP] = useState<Period>("month");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [group, setGroup] = useState<Group>("employee");

  const tx = q.data?.transactions ?? [];
  const emps = q.data?.employees ?? [];
  const nameOf = (id: string) => emps.find((e) => e.user_id === id)?.name ?? "Unknown";

  const perEmp = useMemo(() => {
    const ids = Array.from(new Set(tx.map((t) => t.user_id)));
    return ids.map((id) => ({ id, emp: emps.find((e) => e.user_id === id), s: summarize(tx.filter((t) => t.user_id === id)) }))
      .sort((a, b) => b.s.totalEarned - a.s.totalEarned);
  }, [tx, emps]);

  const range = periodRange(p, from, to);
  const inPeriod = tx.filter((t) => inRange(t.occurred_at, range));
  const projects = q.data?.projects ?? [];
  const allocated = projects.reduce((a, r) => a + r.allocated, 0);
  const assigned = projects.reduce((a, r) => a + r.assigned, 0);
  const all = summarize(tx);

  const breakdown = useMemo(() => {
    const m = new Map<string, { earned: number; pending: number; withdrawn: number }>();
    for (const t of inPeriod) {
      const d = dhakaDay(t.occurred_at);
      const k = group === "day" ? d : group === "month" ? d.slice(0, 7) : group === "week" ? weekKey(d)
        : group === "employee" ? nameOf(t.user_id) : group === "project" ? (t.project ?? "No project") : group === "client" ? (t.client ?? "No client") : t.txn_type;
      const v = m.get(k) ?? { earned: 0, pending: 0, withdrawn: 0 };
      v.earned += t.credit; v.pending += t.pending; if (t.status === "Paid") v.withdrawn += t.debit;
      m.set(k, v);
    }
    return Array.from(m.entries()).sort((a, b) => (["day", "week", "month"].includes(group) ? b[0].localeCompare(a[0]) : b[1].earned - a[1].earned));
  }, [inPeriod, group, emps]);

  if (sel) {
    return (
      <div className="space-y-3 p-4 sm:p-6">
        <button onClick={() => setSel(null)} className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> All employees</button>
        <h1 className="text-[18px] font-semibold">{nameOf(sel)} · Wallet &amp; Earnings</h1>
        <WalletStatement userId={sel} rows={tx.filter((t) => t.user_id === sel)} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-[18px] font-semibold">Employee Earnings</h1>
        <p className="text-[12px] text-muted-foreground">Read from the existing wallet — each earning is one record, shown here and in the employee's wallet.</p>
      </div>
      {q.error && <div className="rounded-sm border border-destructive/40 bg-destructive/5 p-3 text-[12px] text-destructive">{(q.error as Error).message}</div>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Employee Fund allocated" value={money(allocated)} />
        <Stat label="Total employee earnings" value={money(all.totalEarned)} />
        <Stat label="Total committed" value={money(all.pending)} tone="muted" />
        <Stat label="Total available" value={money(all.available)} tone="brand" />
        <Stat label="Total withdrawn" value={money(all.withdrawn)} />
        <Stat label="Remaining Employee Fund" value={money(allocated - assigned)} />
      </div>

      <section className="rounded-sm border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-[13px] font-semibold">Employees</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[12px]">
            <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <tr>{["Employee", "Available", "Pending", "Today", "This Week", "This Month", "Total Earned", "Total Withdrawn"].map((h, i) => <th key={h} className={`px-3 py-2 ${i ? "text-right" : ""}`}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.isLoading ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
                : perEmp.length === 0 ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No wallet activity yet.</td></tr>
                : perEmp.map(({ id, emp, s }) => (
                  <tr key={id} onClick={() => setSel(id)} className="cursor-pointer hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {emp?.avatar ? <img src={emp.avatar} alt="" className="size-6 rounded-full object-cover" /> : <div className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-semibold">{(emp?.name ?? "?").slice(0, 1)}</div>}
                        <div><div className="font-medium">{emp?.name ?? "Unknown"}</div>{emp?.code && <div className="font-mono text-[10.5px] text-muted-foreground">{emp.code}</div>}</div>
                      </div>
                    </td>
                    {[s.available, s.pending, s.today, s.week, s.month, s.totalEarned, s.withdrawn].map((v, i) => <td key={i} className={`px-3 py-2 text-right font-mono ${i === 0 ? "font-semibold text-primary" : ""}`}>{money(v)}</td>)}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-sm border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h3 className="text-[13px] font-semibold">Earnings breakdown</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select value={group} onChange={(e) => setGroup(e.target.value as Group)} className="h-7 rounded-sm border border-input bg-background px-1.5 text-[11.5px]">
              {[["employee", "By employee"], ["project", "By project"], ["client", "By client"], ["type", "By payment type"], ["day", "By day"], ["week", "By week"], ["month", "By month"]].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <PeriodFilter p={p} setP={setP} from={from} to={to} setFrom={setFrom} setTo={setTo} />
          </div>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-[12px]">
          <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2">Group</th><th className="px-3 py-2 text-right">Earned</th><th className="px-3 py-2 text-right">Pending</th><th className="px-3 py-2 text-right">Withdrawn</th></tr></thead>
          <tbody className="divide-y divide-border">
            {breakdown.length === 0 ? <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Nothing in this period.</td></tr>
              : breakdown.map(([k, v]) => <tr key={k}><td className="px-3 py-2">{k}</td><td className="px-3 py-2 text-right font-mono">{money(v.earned)}</td><td className="px-3 py-2 text-right font-mono text-muted-foreground">{money(v.pending)}</td><td className="px-3 py-2 text-right font-mono">{money(v.withdrawn)}</td></tr>)}
          </tbody>
        </table></div>
      </section>

      <section className="rounded-sm border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-[13px] font-semibold">Project-wise employee cost</div>
        <div className="divide-y divide-border">
          {projects.length === 0 ? <p className="p-4 text-[12px] text-muted-foreground">No Employee Fund activity by project yet.</p> : projects.map((r) => {
            const people = tx.filter((t) => t.project_id === r.project_id && (t.credit > 0 || t.pending > 0));
            const byEmp = new Map<string, number>();
            people.forEach((t) => byEmp.set(t.user_id, (byEmp.get(t.user_id) ?? 0) + t.credit + t.pending));
            return (
              <div key={r.project_id ?? "none"} className="p-3">
                <div className="text-[12.5px] font-medium">{r.project ?? "No project"}{r.client ? <span className="text-muted-foreground"> · {r.client}</span> : null}</div>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11.5px] sm:grid-cols-6">
                  {([["Allocated", r.allocated], ["Assigned", r.assigned], ["Committed", r.committed], ["Paid / Available", r.paid], ["Withdrawn", r.withdrawn], ["Remaining", r.allocated - r.assigned]] as [string, number][]).map(([k, v]) => (
                    <div key={k}><div className="text-muted-foreground">{k}</div><div className="font-mono font-semibold">{money(v)}</div></div>
                  ))}
                </div>
                {byEmp.size > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Array.from(byEmp.entries()).map(([id, v]) => <button key={id} onClick={() => setSel(id)} className="rounded-sm border border-border px-2 py-0.5 text-[11px] hover:bg-muted">{nameOf(id)} · <span className="font-mono">{money(v)}</span></button>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function weekKey(d: string) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 1) % 7));
  return `Week of ${t.toISOString().slice(0, 10)}`;
}
