import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getFundDetail } from "@/lib/fund-reports.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Bars, bdt, DataTable, DateRangeBar, ExportButtons, fmtDate, Section, Select, Tile, useDateRange, type Col } from "@/components/finance/fund-report-kit";

export const Route = createFileRoute("/_authenticated/app/finance/funds/$code")({
  head: () => ({
    meta: [
      { title: "Fund Detail · Branta Finance" },
      { name: "description", content: "Money in, money out and the full running-balance ledger for one Branta fund." },
      { property: "og:title", content: "Fund Detail · Branta Finance" },
      { property: "og:description", content: "Per-fund ledger, sources and usage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FundDetailPage,
});

type Row = Awaited<ReturnType<typeof getFundDetail>>["rows"][number];
const CATS = ["salary", "tools", "ads", "office", "misc", "tax", "refund"];

function FundDetailPage() {
  const { code } = Route.useParams();
  const fetchFn = useServerFn(getFundDetail);
  const dr = useDateRange("all");
  const [direction, setDirection] = useState<"all" | "credit" | "debit">("all");
  const [f, setF] = useState<{ type: string | null; projectId: string | null; customerId: string | null; employeeId: string | null; invoiceId: string | null; category: string | null }>({ type: null, projectId: null, customerId: null, employeeId: null, invoiceId: null, category: null });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const params = { code, from: dr.range.from, to: dr.range.to, direction, ...f, search: search.trim() || null, page, pageSize: 50 };
  const q = useQuery({ queryKey: ["fund-detail", params], queryFn: () => fetchFn({ data: params }), placeholderData: keepPreviousData });

  if (q.isLoading) return <div className="mx-auto max-w-7xl p-6"><div className="h-64 animate-pulse rounded-md bg-muted" /></div>;
  if (q.isError) return <div className="p-6 text-[13px] text-destructive">{(q.error as Error).message}</div>;
  const d = q.data!;
  const fd = d.fund;
  const set = (k: keyof typeof f) => (v: string | null) => { setF({ ...f, [k]: v }); setPage(0); };
  const pages = Math.max(1, Math.ceil(d.totals.count / 50));

  const cols: Col<Row>[] = [
    { h: "Date & time", c: (r) => fmtDate(r.created_at), x: (r) => r.created_at, t: "date" },
    { h: "Type", c: (r) => <span className={cn(r.reversal_of && "italic")}>{r.type_label}{r.reversal_of && " ↺"}</span>, x: (r) => r.type_label },
    { h: "Reference", c: (r) => <span className="font-mono text-[11.5px]">{r.reference ?? "—"}</span>, x: (r) => r.reference },
    { h: "Related", c: (r) => <Related r={r} />, x: (r) => [r.client, r.project, r.invoice_slug, r.installment, r.employee, r.category, r.vendor].filter(Boolean).join(" · ") },
    { h: "Version / %", c: (r) => (r.version ? `${r.version} · ${r.percent ?? "—"}%` : "—"), x: (r) => (r.version ? `${r.version} ${r.percent ?? ""}%` : null) },
    { h: "By", c: (r) => r.created_by ?? "system", x: (r) => r.created_by },
    { h: "Credit", right: true, c: (r) => (r.credit ? bdt(r.credit) : ""), x: (r) => r.credit },
    { h: "Debit", right: true, c: (r) => (r.debit ? bdt(r.debit) : ""), x: (r) => r.debit },
    { h: "Running balance", right: true, c: (r) => bdt(r.running_balance), x: (r) => r.running_balance },
  ];
  const loadAll = async () => {
    const all: Row[] = [];
    for (let p = 0; p < 40; p++) {
      const res = await fetchFn({ data: { ...params, page: p, pageSize: 500 } });
      all.push(...res.rows);
      if (res.rows.length < 500) break;
    }
    return all;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/app/finance/funds" className="mb-1 inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3" /> Fund Ledger</Link>
          <h1 className="text-[20px] font-bold">{fd.name}</h1>
          <p className="text-[12.5px] text-muted-foreground">Current allocation <b className="text-foreground">{fd.percent}%</b>{fd.version && <> · version {fd.version}</>} · amounts in BDT · same source as the Fund Ledger dashboard.</p>
        </div>
        {q.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 lg:grid-cols-8">
        <Tile label="Ledger balance" value={bdt(fd.ledger_balance)} />
        <Tile label="Available" value={bdt(fd.available)} hint="Balance − Committed" />
        <Tile label="Allocated" value={bdt(fd.allocated)} onClick={() => { setDirection("credit"); setF({ ...f, type: "allocation" }); }} />
        <Tile label="Spent" value={bdt(fd.spent)} onClick={() => { setDirection("debit"); setF({ ...f, type: null }); }} />
        <Tile label="Committed" value={bdt(fd.committed)} />
        <Tile label="Borrowed" value={bdt(fd.borrowed)} onClick={() => setF({ ...f, type: "loan_in" })} />
        <Tile label="Lent" value={bdt(fd.lent)} onClick={() => setF({ ...f, type: "loan_out" })} />
        <Tile label="Credits − Debits" value={bdt(fd.total_credits - fd.total_debits)} hint={`${bdt(fd.total_credits)} − ${bdt(fd.total_debits)}`} />
      </div>

      <div className="space-y-2 rounded-md border border-border bg-card p-3">
        <DateRangeBar state={{ ...dr, setPreset: (p) => { dr.setPreset(p); setPage(0); } }} />
        <div className="flex flex-wrap gap-1.5">
          <Select value={f.type} onChange={set("type")} options={d.options.types} placeholder="All types" />
          <Select value={f.projectId} onChange={set("projectId")} options={d.options.projects} placeholder="All projects" />
          <Select value={f.customerId} onChange={set("customerId")} options={d.options.clients} placeholder="All clients" />
          <Select value={f.employeeId} onChange={set("employeeId")} options={d.options.employees} placeholder="All employees" />
          <Select value={f.invoiceId} onChange={set("invoiceId")} options={d.options.invoices} placeholder="All invoices" />
          <Select value={f.category} onChange={set("category")} options={CATS.map((c) => ({ id: c, label: c }))} placeholder="Expense category" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search reference, project, client, employee, invoice, expense…" className="h-8 w-full rounded-sm text-[12px] sm:w-72" />
        </div>
      </div>

      <Section title="Fund transactions"
        right={<div className="flex flex-wrap items-center gap-2">
          {(["all", "credit", "debit"] as const).map((k) => (
            <button key={k} onClick={() => { setDirection(k); setPage(0); }} className={cn("h-7 rounded-sm border px-2 text-[11.5px]", direction === k ? "border-primary bg-primary/10 text-primary" : "border-border")}>
              {k === "all" ? "Full ledger" : k === "credit" ? "Money in" : "Money out"}
            </button>
          ))}
          <ExportButtons title={`${fd.name} ledger`} cols={cols} load={loadAll} preamble={[`${fd.name} — ${dr.range.from ?? "start"} to ${dr.range.to ?? "today"} (BDT)`]} />
        </div>}>
        <div className="mb-2 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
          <span>{d.totals.count} entries</span>
          <span>Credits in filter: <b className="font-mono text-foreground">{bdt(d.totals.credits)}</b></span>
          <span>Debits in filter: <b className="font-mono text-foreground">{bdt(d.totals.debits)}</b></span>
          <span>Running balance is all-time per fund (ordered by time, then id).</span>
        </div>
        <DataTable cols={cols} rows={d.rows} empty="No transactions match these filters." />
        <div className="mt-2 flex items-center justify-end gap-2 text-[12px]">
          <Button size="sm" variant="outline" className="h-7" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
          <span>Page {page + 1} / {pages}</span>
          <Button size="sm" variant="outline" className="h-7" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Which projects funded this fund" right={<ExportButtons title={`${fd.name} sources`} rows={d.sources} cols={srcCols} />}>
          <DataTable cols={srcCols} rows={d.sources} empty="No invoice allocations in this period." />
        </Section>
        <Section title="Where the money was used">
          <Bars items={d.usage} />
          {fd.code === "software" && d.vendors.length > 0 && (
            <div className="mt-4"><div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">By vendor (as recorded)</div><Bars items={d.vendors} /></div>
          )}
        </Section>
      </div>

      {d.employees && (
        <Section title="Employee cost breakdown (financial cost only)">
          <DataTable cols={[
            { h: "Employee", c: (r: any) => r.name },
            { h: "Committed", right: true, c: (r: any) => bdt(r.committed) },
            { h: "Paid", right: true, c: (r: any) => bdt(r.paid) },
            { h: "Project payments", right: true, c: (r: any) => bdt(r.project) },
            { h: "Salary", right: true, c: (r: any) => bdt(r.salary) },
            { h: "Bonus / incentive", right: true, c: (r: any) => bdt(r.bonus) },
            { h: "Outstanding commitment", right: true, c: (r: any) => bdt(r.outstanding) },
          ]} rows={d.employees.rows} />
          <div className="mt-4 mb-1 text-[11px] font-semibold uppercase text-muted-foreground">Top employee cost by project</div>
          <Bars items={d.employees.byProject.map((p: any) => ({ label: p.project, amount: p.amount }))} />
        </Section>
      )}
    </div>
  );
}

type Src = Awaited<ReturnType<typeof getFundDetail>>["sources"][number];
const srcCols: Col<Src>[] = [
  { h: "Project", c: (r) => r.project, x: (r) => r.project },
  { h: "Client", c: (r) => r.client, x: (r) => r.client },
  { h: "Collected", right: true, c: (r) => bdt(r.collected), x: (r) => r.collected },
  { h: "Fund allocation", right: true, c: (r) => bdt(r.allocated), x: (r) => r.allocated },
  { h: "%", right: true, c: (r) => `${r.percent}%`, x: (r) => r.percent },
];

function Related({ r }: { r: Row }) {
  const bits = [r.client, r.project, r.installment, r.employee, r.category && `cat: ${r.category}`, r.vendor].filter(Boolean);
  return (
    <div className="max-w-[280px] text-[12px]">
      {r.invoice_slug && <Link to="/app/finance/invoices/$slug" params={{ slug: r.invoice_slug }} className="font-mono text-primary hover:underline">{r.invoice_slug}</Link>}
      {bits.length > 0 && <div className="truncate text-muted-foreground">{bits.join(" · ")}</div>}
      {(r.notes || r.description) && <div className="truncate text-muted-foreground/80">{r.notes || r.description}</div>}
    </div>
  );
}
