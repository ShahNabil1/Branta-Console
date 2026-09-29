import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { getProjectProfitability, getProjectProfitDetail } from "@/lib/fund-reports.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bdt, DataTable, DateRangeBar, ExportButtons, fmtDay, money2, Section, Select, Tile, useDateRange, usd, type Col } from "@/components/finance/fund-report-kit";

export const Route = createFileRoute("/_authenticated/app/finance/profitability")({
  head: () => ({
    meta: [
      { title: "Project Profitability · Branta Finance" },
      { name: "description", content: "Cash-based project contribution, direct deductions and Employee Fund allocation vs actual cost." },
      { property: "og:title", content: "Project Profitability · Branta Finance" },
      { property: "og:description", content: "Cash-based project contribution analysis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfitabilityPage,
});

type Row = Awaited<ReturnType<typeof getProjectProfitability>>["rows"][number];
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${bdt(Math.abs(n)).replace("৳ ", "৳ ")}`;

const cols: Col<Row>[] = [
  { h: "Project", c: (r) => <div><div className="font-semibold">{r.project}</div><div className="text-[11px] text-muted-foreground">{r.client} · {r.project_type ?? "—"} · {r.status ?? "—"}</div></div>, x: (r) => r.project },
  { h: "Client", c: () => null, x: (r) => r.client },
  { h: "Value", right: true, c: (r) => money2(r.project_value), x: (r) => r.project_value.BDT },
  { h: "Invoiced", right: true, c: (r) => money2(r.invoiced), x: (r) => r.invoiced.BDT },
  { h: "Collected", right: true, c: (r) => money2(r.collected), x: (r) => r.collected.BDT },
  { h: "Collected USD", c: () => null, x: (r) => r.collected.USD },
  { h: "Outstanding", right: true, c: (r) => money2(r.outstanding), x: (r) => r.outstanding.BDT },
  { h: "Deductions", right: true, c: (r) => bdt(r.direct_deductions), x: (r) => r.direct_deductions },
  { h: "Distributable", right: true, c: (r) => bdt(r.distributable), x: (r) => r.distributable },
  { h: "Emp. alloc", right: true, c: (r) => bdt(r.employee_allocation), x: (r) => r.employee_allocation },
  { h: "Emp. paid", right: true, c: (r) => bdt(r.employee_paid), x: (r) => r.employee_paid },
  { h: "Emp. committed", right: true, c: (r) => bdt(r.employee_committed), x: (r) => r.employee_committed },
  { h: "Emp. variance", right: true, c: (r) => <span className={r.employee_variance < 0 ? "text-destructive" : "text-emerald-700"}>{signed(r.employee_variance)}</span>, x: (r) => r.employee_variance },
  { h: "Project expenses", right: true, c: (r) => money2(r.project_expenses), x: (r) => r.project_expenses.BDT },
  { h: "Other fund alloc", right: true, c: (r) => bdt(r.other_allocations), x: (r) => r.other_allocations },
  { h: "Net contribution", right: true, c: (r) => <b className={r.net_contribution_bdt < 0 ? "text-destructive" : ""}>{bdt(r.net_contribution_bdt)}</b>, x: (r) => r.net_contribution_bdt },
];
const visible = cols.filter((c) => !["Client", "Collected USD"].includes(c.h));

function ProfitabilityPage() {
  const fn = useServerFn(getProjectProfitability);
  const dr = useDateRange("all");
  const [f, setF] = useState<{ customerId: string | null; status: string | null; projectType: string | null; managerId: string | null }>({ customerId: null, status: null, projectType: null, managerId: null });
  const [search, setSearch] = useState(""); const [service, setService] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const params = { from: dr.range.from, to: dr.range.to, ...f, service: service.trim() || null, search: search.trim() || null };
  const q = useQuery({ queryKey: ["profitability", params], queryFn: () => fn({ data: params }), placeholderData: keepPreviousData });

  if (q.isLoading) return <div className="mx-auto max-w-7xl p-6"><div className="h-64 animate-pulse rounded-md bg-muted" /></div>;
  if (q.isError) return <div className="p-6 text-[13px] text-destructive">{(q.error as Error).message}</div>;
  const d = q.data!;
  const sum = (k: (r: Row) => number) => d.rows.reduce((a, r) => a + k(r), 0);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[20px] font-bold">Project Profitability</h1>
          <p className="max-w-3xl text-[12.5px] text-muted-foreground">
            Cash basis — only money actually received counts as collected. <b className="text-foreground">Net Project Contribution (BDT)</b> = Collected − Direct deductions − Project-linked expenses − Employee payments paid for the project. Fund allocations are internal distribution and are shown separately, never subtracted. BDT and USD are never added together.
          </p>
        </div>
        {q.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="space-y-2 rounded-md border border-border bg-card p-3">
        <DateRangeBar state={dr} />
        <div className="flex flex-wrap gap-1.5">
          <Select value={f.customerId} onChange={(v) => setF({ ...f, customerId: v })} options={d.options.clients} placeholder="All clients" />
          <Select value={f.status} onChange={(v) => setF({ ...f, status: v })} options={d.options.statuses.map((s: string) => ({ id: s, label: s }))} placeholder="Any status" />
          <Select value={f.projectType} onChange={(v) => setF({ ...f, projectType: v })} options={d.options.types.map((s: string) => ({ id: s, label: s }))} placeholder="Any type" />
          <Select value={f.managerId} onChange={(v) => setF({ ...f, managerId: v })} options={d.options.managers} placeholder="Any owner / manager" />
          <Input value={service} onChange={(e) => setService(e.target.value)} placeholder="Service" className="h-8 w-36 rounded-sm text-[12px]" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search project or client…" className="h-8 w-60 rounded-sm text-[12px]" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="Collected (BDT)" value={bdt(sum((r) => r.collected.BDT))} hint={sum((r) => r.collected.USD) ? `+ ${usd(sum((r) => r.collected.USD))} (separate)` : undefined} />
        <Tile label="Direct deductions" value={bdt(sum((r) => r.direct_deductions))} />
        <Tile label="Employee allocation" value={bdt(sum((r) => r.employee_allocation))} />
        <Tile label="Employee paid" value={bdt(sum((r) => r.employee_paid))} />
        <Tile label="Employee committed" value={bdt(sum((r) => r.employee_committed))} />
        <Tile label="Net contribution" value={bdt(sum((r) => r.net_contribution_bdt))} />
      </div>

      <Section title={`${d.rows.length} projects`} right={<ExportButtons title="Project profitability" cols={cols} rows={d.rows} preamble={[`Period: ${dr.range.from ?? "start"} → ${dr.range.to ?? "today"}`, "Cash basis. Fund metrics BDT only."]} />}>
        <div className="[&_tr]:cursor-pointer">
          <table className="hidden" />
          <div onClick={(e) => { const tr = (e.target as HTMLElement).closest("tr[data-i]"); if (tr) setOpen(d.rows[Number(tr.getAttribute("data-i"))]?.project_id ?? null); }}>
            <ClickTable rows={d.rows} />
          </div>
        </div>
      </Section>

      {open && <Detail projectId={open} range={dr.range} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ClickTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1200px] text-[12px]">
        <thead><tr className="border-b border-border text-left text-[10.5px] uppercase tracking-wide text-muted-foreground">{visible.map((c) => <th key={c.h} className={cn("px-2 py-2", c.right && "text-right")}>{c.h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={visible.length} className="py-6 text-center text-muted-foreground">No projects match.</td></tr>}
          {rows.map((r, i) => <tr key={r.project_id} data-i={i} className="border-b border-border/60 hover:bg-muted/40">{visible.map((c) => <td key={c.h} className={cn("px-2 py-1.5 align-top", c.right && "text-right font-mono")}>{c.c(r)}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ projectId, range, onClose }: { projectId: string; range: { from: string | null; to: string | null }; onClose: () => void }) {
  const fn = useServerFn(getProjectProfitDetail);
  const q = useQuery({ queryKey: ["profit-detail", projectId, range], queryFn: () => fn({ data: { projectId, ...range } }) });
  const d = q.data;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-background p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[16px] font-bold">{d?.summary.project ?? "Project"}</h2>
          <Button size="icon" variant="ghost" onClick={onClose}><X className="size-4" /></Button>
        </div>
        {q.isLoading && <Loader2 className="size-5 animate-spin" />}
        {q.isError && <div className="text-[13px] text-destructive">{(q.error as Error).message}</div>}
        {d && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Tile label="Collected" value={money2(d.summary.collected)} />
              <Tile label="Direct deductions" value={bdt(d.summary.direct_deductions)} />
              <Tile label="Project expenses" value={money2(d.summary.project_expenses)} />
              <Tile label="Employee paid" value={bdt(d.summary.employee_paid)} />
              <Tile label="Employee variance" value={signed(d.summary.employee_variance)} hint="Allocation − Paid − Committed (analysis only)" tone={d.summary.employee_variance < 0 ? "warn" : "ok"} />
              <Tile label="Net contribution" value={bdt(d.summary.net_contribution_bdt)} />
            </div>
            <Section title="Invoices">
              <DataTable cols={[
                { h: "Invoice", c: (r: any) => <Link to="/app/finance/invoices/$slug" params={{ slug: r.slug }} className="font-mono text-primary">{r.slug}</Link> },
                { h: "Status", c: (r: any) => r.status },
                { h: "Total", right: true, c: (r: any) => (r.currency === "USD" ? usd(r.total_amount) : bdt(r.total_amount)) },
                { h: "Paid", right: true, c: (r: any) => (r.currency === "USD" ? usd(r.paid_amount) : bdt(r.paid_amount)) },
              ]} rows={d.invoices} />
            </Section>
            <Section title="Installments">
              <DataTable cols={[
                { h: "Invoice", c: (r: any) => r.invoice_slug }, { h: "Installment", c: (r: any) => r.label || `#${r.sequence}` },
                { h: "Status", c: (r: any) => r.status }, { h: "Paid on", c: (r: any) => fmtDay(r.paid_at) },
                { h: "Amount", right: true, c: (r: any) => (r.currency === "USD" ? usd(r.paid_amount || r.amount) : bdt(r.paid_amount || r.amount)) },
              ]} rows={d.installments} />
            </Section>
            <div className="grid gap-3 sm:grid-cols-2">
              <Section title="Direct deductions">
                <DataTable cols={[{ h: "Type", c: (r: any) => r.label }, { h: "Amount", right: true, c: (r: any) => bdt(r.amount) }]} rows={d.summary.deduction_breakdown} empty="None" />
              </Section>
              <Section title="Fund allocation (internal distribution)">
                <DataTable cols={[{ h: "Fund", c: (r: any) => r.fund }, { h: "Amount", right: true, c: (r: any) => bdt(r.amount) }]} rows={d.allocationsByFund} empty="Not allocated" />
              </Section>
            </div>
            <Section title="Employee payments">
              <DataTable cols={[{ h: "Employee", c: (r: any) => r.employee }, { h: "Type", c: (r: any) => r.payment_type }, { h: "Status", c: (r: any) => r.status }, { h: "Paid", c: (r: any) => fmtDay(r.paid_at) }, { h: "Amount", right: true, c: (r: any) => bdt(r.amount) }]} rows={d.payments} empty="No employee payments linked to this project." />
            </Section>
            <Section title="Project-linked expenses">
              <DataTable cols={[{ h: "Voucher", c: (r: any) => r.voucher_no }, { h: "Category", c: (r: any) => r.category }, { h: "Vendor", c: (r: any) => r.vendor ?? "—" }, { h: "Date", c: (r: any) => r.spent_on }, { h: "Amount", right: true, c: (r: any) => (r.currency === "USD" ? usd(r.amount) : bdt(r.amount)) }]} rows={d.expenses} empty="No expenses linked to this project's invoices." />
            </Section>
            <Section title="Money timeline">
              <DataTable cols={[{ h: "When", c: (r: any) => fmtDay(r.at) }, { h: "Event", c: (r: any) => r.kind }, { h: "Detail", c: (r: any) => r.label }, { h: "Amount", right: true, c: (r: any) => (r.currency === "USD" ? usd(r.amount) : bdt(r.amount)) }]} rows={d.timeline} />
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
