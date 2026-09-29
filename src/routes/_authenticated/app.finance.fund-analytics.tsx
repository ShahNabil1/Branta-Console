import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getFundAnalytics } from "@/lib/fund-reports.functions";
import { cn } from "@/lib/utils";
import { Bars, bdt, DataTable, DateRangeBar, ExportButtons, fmtDate, money2, Section, Tile, useDateRange, type Col } from "@/components/finance/fund-report-kit";

export const Route = createFileRoute("/_authenticated/app/finance/fund-analytics")({
  head: () => ({
    meta: [
      { title: "Fund Analytics · Branta Finance" },
      { name: "description", content: "Collections, deductions, fund distribution, spending, employee cost and profit retention." },
      { property: "og:title", content: "Fund Analytics · Branta Finance" },
      { property: "og:description", content: "Fund Ledger analytics for Branta Finance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyticsPage,
});

type D = Awaited<ReturnType<typeof getFundAnalytics>>;
type F = D["funds"][number];

function AnalyticsPage() {
  const fn = useServerFn(getFundAnalytics);
  const dr = useDateRange("this_year");
  const q = useQuery({ queryKey: ["fund-analytics", dr.range], queryFn: () => fn({ data: dr.range }), placeholderData: keepPreviousData });
  const [sel, setSel] = useState<string[]>(["employee"]);
  if (q.isLoading) return <div className="mx-auto max-w-7xl p-6"><div className="h-64 animate-pulse rounded-md bg-muted" /></div>;
  if (q.isError) return <div className="p-6 text-[13px] text-destructive">{(q.error as Error).message}</div>;
  const d = q.data!; const k = d.kpis;
  const fund = (c: string) => d.funds.find((x) => x.code === c);
  const go = (code: string) => ({ to: "/app/finance/funds/$code" as const, params: { code } });

  const summaryCols: Col<[string, string | number]>[] = [{ h: "Metric", c: (r) => r[0], x: (r) => r[0] }, { h: "Value", c: (r) => r[1], x: (r) => r[1] }];
  const summaryRows: [string, string | number][] = [
    ["Total collected BDT", k.collected.BDT], ["Total collected USD (separate)", k.collected.USD], ["Direct deductions", k.deductions],
    ["Distributable", k.distributable], ["Fund allocation", k.allocated], ["Fund spending", k.spending], ["Employee payments", k.employeePaid],
    ["Operating expenses (fund-paid)", k.operatingExpenses], ["Committed (current)", k.committed], ["Profit Fund retained (current)", k.profitRetained],
    ["Outstanding client BDT", k.outstanding.BDT], ["Outstanding client USD", k.outstanding.USD],
    ...d.funds.flatMap((f) => [[`${f.name} allocated`, f.allocated], [`${f.name} spent`, f.spent], [`${f.name} available`, f.available]] as [string, number][]),
  ];
  const fundCols: Col<F>[] = [
    { h: "Fund", c: (r) => <Link {...go(r.code)} className="text-primary hover:underline">{r.name}</Link>, x: (r) => r.name },
    { h: "Share of distributable", right: true, c: (r) => `${r.share}%`, x: (r) => r.share },
    { h: "Distributed", right: true, c: (r) => bdt(r.distributed), x: (r) => r.distributed },
    { h: "Allocated (net)", right: true, c: (r) => bdt(r.allocated), x: (r) => r.allocated },
    { h: "Spent (net)", right: true, c: (r) => bdt(r.spent), x: (r) => r.spent },
    { h: "Balance now", right: true, c: (r) => bdt(r.balance), x: (r) => r.balance },
    { h: "Available now", right: true, c: (r) => bdt(r.available), x: (r) => r.available },
  ];
  const sm = (c: string) => { const f = fund(c); return f ? <div className="space-y-2"><div className="grid grid-cols-3 gap-2"><Tile label="Allocated" value={bdt(f.allocated)} /><Tile label="Spent" value={bdt(f.spent)} /><Tile label="Balance" value={bdt(f.balance)} /></div><Bars items={f.usage} /></div> : null; };

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[20px] font-bold">Fund Analytics</h1>
          <p className="text-[12.5px] text-muted-foreground">Fund metrics in BDT. Transfers and loans are internal and never counted as income or spending. Historical allocations use the snapshot saved at the time. Calculated {fmtDate(d.calculatedAt)}.</p>
        </div>
        <div className="flex items-center gap-2">{q.isFetching && <Loader2 className="size-4 animate-spin" />}<ExportButtons title="Fund analytics summary" cols={summaryCols} rows={summaryRows} preamble={[`Period ${dr.range.from ?? "start"} → ${dr.range.to ?? "today"}`]} /></div>
      </div>
      <div className="rounded-md border border-border bg-card p-3"><DateRangeBar state={dr} /></div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-5">
        <Tile label="Total collected" value={money2(k.collected)} />
        <Tile label="Direct deductions" value={bdt(k.deductions)} />
        <Tile label="Distributable" value={bdt(k.distributable)} />
        <Tile label="Fund allocation" value={bdt(k.allocated)} />
        <Tile label="Fund spending" value={bdt(k.spending)} />
        <Tile label="Employee payments" value={bdt(k.employeePaid)} onClick={() => document.getElementById("emp")?.scrollIntoView({ behavior: "smooth" })} />
        <Tile label="Operating expenses" value={bdt(k.operatingExpenses)} hint="Fund-paid expenses, net of reversals" />
        <Tile label="Committed (now)" value={bdt(k.committed)} />
        <Tile label="Retained Profit Reserve" value={bdt(k.profitRetained)} />
        <Tile label="Outstanding from clients" value={money2(k.outstanding)} />
      </div>

      <Section title="Fund distribution & actual spending" right={<ExportButtons title="Fund distribution" cols={fundCols} rows={d.funds} />}>
        <DataTable cols={fundCols} rows={d.funds} />
      </Section>

      <Section title="Monthly fund trend" right={<div className="flex flex-wrap gap-1">{d.funds.map((f) => (
        <button key={f.code} onClick={() => setSel(sel.includes(f.code) ? sel.filter((x) => x !== f.code) : [...sel, f.code])} className={cn("h-6 rounded-sm border px-1.5 text-[11px]", sel.includes(f.code) ? "border-primary bg-primary/10 text-primary" : "border-border")}>{f.code}</button>
      ))}</div>}>
        <DataTable cols={[
          { h: "Fund", c: (r: any) => r.fund }, { h: "Month", c: (r: any) => r.month },
          { h: "Allocated", right: true, c: (r: any) => bdt(r.allocated) }, { h: "Spent", right: true, c: (r: any) => bdt(r.spent) }, { h: "Ending balance", right: true, c: (r: any) => bdt(r.ending) },
        ]} rows={d.funds.filter((f) => sel.includes(f.code)).flatMap((f) => f.months.map((m) => ({ fund: f.name, ...m })))} empty="No movement for the selected funds in this period." />
      </Section>

      <div id="emp">
        <Section title="Employee cost analytics">
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Tile label="Employee Fund allocation" value={bdt(d.employee.allocated)} />
            <Tile label="Paid" value={bdt(d.employee.paid)} />
            <Tile label="Committed (unpaid)" value={bdt(d.employee.committed)} />
            <Tile label="Employee Fund available" value={bdt(d.employee.available)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {([["By project", d.employee.byProject], ["By employee", d.employee.byEmployee], ["By payment type", d.employee.byType], ["By month", d.employee.byMonth]] as const).map(([t, rows]) => (
              <div key={t}><div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">{t}</div>
                <DataTable cols={[{ h: "Name", c: (r: any) => r.label }, { h: "Paid", right: true, c: (r: any) => bdt(r.paid) }, { h: "Committed", right: true, c: (r: any) => bdt(r.committed) }]} rows={rows as any[]} empty="None" />
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Office & Operations spending">{sm("office")}</Section>
        <Section title="Software & Subscription spending">
          {sm("software")}
          <div className="mt-3 mb-1 text-[11px] font-semibold uppercase text-muted-foreground">By vendor (only as recorded on expenses)</div>
          <Bars items={fund("software")?.vendors ?? []} />
        </Section>
        <Section title="Sales Fund">{sm("sales")}</Section>
        <Section title="Marketing Fund">{sm("marketing")}</Section>
      </div>

      {d.profit && (
        <Section title="Profit retention (Profit Fund Allocation — not realised accounting profit)">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Tile label="Profit Fund Allocation" value={bdt(d.profit.allocated)} />
            <Tile label="Owner withdrawals" value={bdt(d.profit.withdrawals)} />
            <Tile label="Transfers out" value={bdt(d.profit.transfersOut)} />
            <Tile label="Exceptional expenses" value={bdt(d.profit.exceptional)} />
            <Tile label="Retained Profit Reserve" value={bdt(d.profit.retained)} />
          </div>
          <Link {...go("profit")} className="mt-2 inline-block text-[12px] text-primary hover:underline">Open Profit Fund transactions →</Link>
        </Section>
      )}
    </div>
  );
}
