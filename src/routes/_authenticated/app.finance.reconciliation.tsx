import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RotateCw } from "lucide-react";
import { getReconciliation } from "@/lib/fund-reports.functions";
import { AllocationMismatchPanel } from "@/components/finance/allocation-mismatch-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bdt, DataTable, ExportButtons, fmtDate, fmtDay, Section, type Col } from "@/components/finance/fund-report-kit";

export const Route = createFileRoute("/_authenticated/app/finance/reconciliation")({
  head: () => ({
    meta: [
      { title: "Reconciliation · Branta Finance" },
      { name: "description", content: "Compare real company cash with the Branta Fund Ledger and find any difference." },
      { property: "og:title", content: "Reconciliation · Branta Finance" },
      { property: "og:description", content: "Company cash vs Fund Ledger reconciliation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReconPage,
});

type Line = { label: string; amount: number; sign: "" | "+" | "−" | "="; note: string; drill?: string };

function ReconPage() {
  const fn = useServerFn(getReconciliation);
  const q = useQuery({ queryKey: ["reconciliation"], queryFn: () => fn() });
  const [drill, setDrill] = useState<string | null>(null);
  if (q.isLoading) return <div className="mx-auto max-w-6xl p-6"><div className="h-64 animate-pulse rounded-md bg-muted" /></div>;
  if (q.isError) return <div className="p-6 text-[13px] text-destructive">{(q.error as Error).message}</div>;
  const d = q.data!; const c = d.components;
  const ok = d.status === "Matched";

  const lines: Line[] = [
    { label: "Real company cash (Wallet)", amount: c.realCash, sign: "", note: `Paid installments ${bdt(c.received)} + company ledger ${bdt(c.companyLedger)} − live expenses ${bdt(c.expensesTotal)}` },
    { label: "Legacy / pre-ledger cash", amount: c.legacy, sign: "−", note: `${d.legacyCount} paid installments never sent to the Fund Ledger (Phase 4 handles these)`, drill: "legacy" },
    { label: "Unallocated eligible cash", amount: c.unallocated, sign: "−", note: `${d.unallocatedRows.length} paid installments whose allocation failed`, drill: "unallocated" },
    { label: "Direct deductions on allocated payments", amount: c.deductions, sign: "−", note: "Taken out before distribution, never enter a fund" },
    { label: "Expenses not paid from a fund", amount: c.nonFundExpenses, sign: "+", note: "Reduced real cash but never touched the Fund Ledger", drill: "nonfund" },
    { label: "Company ledger adjustments", amount: c.companyLedger, sign: "−", note: "Wallet-only entries (manual, withdrawal payouts)", drill: "companyledger" },
    { label: "Employee fund payments paid", amount: c.employeePaid, sign: "−", note: "Reduce funds; the Wallet formula does not track them" },
    { label: "Owner withdrawals", amount: c.ownerWithdrawals, sign: "−", note: "Profit Fund debits; not in the Wallet formula" },
    { label: "Expected Fund-Ledger cash", amount: c.expected, sign: "=", note: "" },
    { label: "Fund Ledger total balance (active funds)", amount: c.fundTotal, sign: "", note: "Σ ledger balances. Committed is not subtracted — it is a restriction, not cash." },
  ];
  const lineCols: Col<Line>[] = [
    { h: "", c: (r) => <span className="font-mono">{r.sign}</span>, x: (r) => r.sign },
    { h: "Component", c: (r) => <div><div className={cn(r.sign === "=" && "font-bold")}>{r.label}</div><div className="text-[11px] text-muted-foreground">{r.note}</div></div>, x: (r) => r.label },
    { h: "Amount (BDT)", right: true, c: (r) => bdt(r.amount), x: (r) => r.amount },
    { h: "", c: (r) => r.drill ? <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setDrill(r.drill!)}>Details</Button> : null },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <AllocationMismatchPanel />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[20px] font-bold">Reconciliation</h1>
          <p className="text-[12.5px] text-muted-foreground">As of today only — the Wallet cannot be reliably rebuilt for past dates, so no historical figures are shown. BDT only. Last calculated {fmtDate(d.calculatedAt)}.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8" onClick={() => void q.refetch()}>{q.isFetching ? <Loader2 className="mr-1 size-3 animate-spin" /> : <RotateCw className="mr-1 size-3" />}Recalculate</Button>
          <ExportButtons title="Reconciliation breakdown" cols={lineCols} rows={[...lines, { label: "Difference", amount: c.difference, sign: "", note: d.status }]} />
        </div>
      </div>

      <div className={cn("flex items-start gap-3 rounded-md border p-4", ok ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50")}>
        {ok ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-700" /> : <AlertTriangle className="mt-0.5 size-5 text-amber-700" />}
        <div className="text-[13px]">
          <div className="font-semibold">Status: {d.status} · Difference {bdt(c.difference)}</div>
          <div className="text-muted-foreground">Difference = Fund Ledger total − Expected Fund-Ledger cash. Nothing is corrected automatically — use the details below to find the source.</div>
        </div>
      </div>

      <Section title="Formula"><DataTable cols={lineCols} rows={lines} /></Section>

      <div className="grid gap-4 md:grid-cols-3">
        <Section title="Committed employee payments"><div className="font-mono text-[16px] font-bold">{bdt(c.committed)}</div><p className="text-[11px] text-muted-foreground">Restriction on availability, not cash moved.</p></Section>
        <Section title="Fund loans receivable"><div className="font-mono text-[16px] font-bold">{bdt(c.loansReceivable)}</div><p className="text-[11px] text-muted-foreground">Owed to lending funds. <Link to="/app/finance/fund-loans" className="text-primary">Loans</Link></p></Section>
        <Section title="Fund loans liability"><div className="font-mono text-[16px] font-bold">{bdt(c.loansLiability)}</div><p className="text-[11px] text-muted-foreground">Same loans seen from borrowing funds — net zero company-wide.</p></Section>
      </div>

      <Section title="Fund balances">
        <DataTable cols={[
          { h: "Fund", c: (r: any) => <Link to="/app/finance/funds/$code" params={{ code: r.code }} className="text-primary">{r.name}</Link> },
          { h: "Balance", right: true, c: (r: any) => bdt(r.balance) }, { h: "Committed", right: true, c: (r: any) => bdt(r.committed) },
        ]} rows={d.funds} />
      </Section>

      {drill === "unallocated" && <Section title="Unallocated paid installments" right={<Link to="/app/finance/funds" className="text-[12px] text-primary">Retry on Fund Ledger →</Link>}><InstTable rows={d.unallocatedRows} /></Section>}
      {drill === "legacy" && <Section title={`Legacy / pre-ledger installments (${d.legacyCount}${d.legacyCount > 500 ? ", first 500" : ""})`}><InstTable rows={d.legacyRows} /></Section>}
      {drill === "nonfund" && <Section title="Expenses not paid from a fund">
        <DataTable cols={[{ h: "Voucher", c: (r: any) => r.voucher_no }, { h: "Date", c: (r: any) => r.spent_on }, { h: "Category", c: (r: any) => r.category }, { h: "Vendor", c: (r: any) => r.vendor ?? "—" }, { h: "Amount", right: true, c: (r: any) => bdt(r.amount) }]} rows={d.nonFundExpenses} />
      </Section>}
      {drill === "companyledger" && <Section title="Company ledger entries (BDT)">
        <DataTable cols={[{ h: "Date", c: (r: any) => r.occurred_on }, { h: "Kind", c: (r: any) => r.kind }, { h: "Notes", c: (r: any) => r.notes ?? "—" }, { h: "Amount", right: true, c: (r: any) => bdt(r.amount) }]} rows={d.companyLedgerRows} />
      </Section>}
    </div>
  );
}

function InstTable({ rows }: { rows: any[] }) {
  return <DataTable cols={[
    { h: "Invoice", c: (r: any) => <Link to="/app/finance/invoices/$slug" params={{ slug: r.invoice_slug }} className="font-mono text-primary">{r.invoice_slug}</Link> },
    { h: "Client", c: (r: any) => r.client ?? "—" }, { h: "Installment", c: (r: any) => r.label },
    { h: "Paid on", c: (r: any) => fmtDay(r.paid_at) }, { h: "Issue", c: (r: any) => r.error ?? "—" },
    { h: "Amount", right: true, c: (r: any) => bdt(r.amount) },
  ]} rows={rows} empty="None" />;
}
