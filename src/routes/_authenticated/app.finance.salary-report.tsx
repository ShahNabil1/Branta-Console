import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2, BadgeDollarSign, Download, FileText, FileSpreadsheet, FileType, RotateCcw,
} from "lucide-react";
import {
  getSalaryReport,
  exportSalaryReport,
  listSalaryEmployees,
} from "@/lib/salary.functions";
import { isFinanceAdminCheck } from "@/lib/finance.functions";
import { KpiTile } from "@/components/branta/kpi-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect, type SearchableItem } from "@/components/finance/searchable-select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/app/finance/salary-report")({
  head: () => ({
    meta: [
      { title: "Salary Report · Finance · Branta" },
      { name: "description", content: "Month-by-month salary report with basic, bonus and deduction breakdown, exportable to PDF, Excel and CSV." },
      { property: "og:title", content: "Salary Report · Finance · Branta" },
      { property: "og:description", content: "Filter salary slips by month, employee and status, then export the exact result set." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SalaryReportPage,
});

type Currency = "BDT" | "USD";
type Fmt = "pdf" | "xlsx" | "csv";

const thisMonth = () => new Date().toISOString().slice(0, 7);

function fmtMoney(n: number, cur: Currency) {
  return (cur === "BDT" ? "৳ " : "$ ") + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function download(base64: string, mime: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function SalaryReportPage() {
  const check = useServerFn(isFinanceAdminCheck);
  const isAdmin = useQuery({ queryKey: ["is-finance-admin"], queryFn: () => check(), staleTime: 60_000 });

  const [fromMonth, setFromMonth] = useState(thisMonth());
  const [toMonth, setToMonth] = useState(thisMonth());
  const [currency, setCurrency] = useState<Currency>("BDT");
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<"all" | "issued" | "void">("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<Fmt | null>(null);

  const filters = useMemo(
    () => ({ from: `${fromMonth}-01`, to: `${toMonth}-01`, currency, userId, status, search }),
    [fromMonth, toMonth, currency, userId, status, search],
  );

  const reportFn = useServerFn(getSalaryReport);
  const q = useQuery({
    queryKey: ["salary-report", filters],
    queryFn: () => reportFn({ data: filters }),
    staleTime: 15_000,
    enabled: !!isAdmin.data?.isAdmin,
    placeholderData: (p) => p,
  });

  const empFn = useServerFn(listSalaryEmployees);
  const emps = useQuery({
    queryKey: ["salary-employees"], queryFn: () => empFn(), staleTime: 60_000,
    enabled: !!isAdmin.data?.isAdmin,
  });
  const employeeItems: SearchableItem[] = (emps.data ?? []).map((e) => ({
    value: e.user_id,
    label: e.full_name ?? e.user_id.slice(0, 8),
    hint: e.employee_code ?? undefined,
    keywords: [e.full_name, e.employee_code],
  }));

  const exportFn = useServerFn(exportSalaryReport);
  const doExport = async (format: Fmt) => {
    if (busy) return;
    setBusy(format);
    const t = toast.loading(`Preparing ${format.toUpperCase()} salary report…`);
    try {
      const chips = [
        userId ? `Employee: ${employeeItems.find((e) => e.value === userId)?.label ?? "selected"}` : null,
        status !== "all" ? `Status: ${status}` : null,
        search.trim() ? `“${search.trim()}”` : null,
      ].filter(Boolean) as string[];
      const res = await exportFn({
        data: {
          ...filters,
          format,
          periodLabel: fromMonth === toMonth ? fromMonth : `${fromMonth} → ${toMonth}`,
          filterLabels: chips,
          fileBase: `salary-report-${fromMonth}${fromMonth === toMonth ? "" : `_to_${toMonth}`}`,
        },
      });
      download(res.base64, res.mime, res.filename);
      toast.success(`${res.count} slip${res.count === 1 ? "" : "s"} exported`, { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed", { id: t });
    } finally {
      setBusy(null);
    }
  };

  if (isAdmin.isLoading) {
    return <div className="grid h-64 place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!isAdmin.data?.isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <BadgeDollarSign className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h1 className="text-[18px] font-semibold">Finance-only page</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Finance or Super-admin role required.</p>
      </div>
    );
  }

  const rows = q.data?.rows ?? [];
  const s = q.data?.summary;

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[20px] font-semibold text-foreground">Salary Report · বেতন রিপোর্ট</h1>
          <p className="text-[12.5px] text-muted-foreground">
            Month, employee, basic, bonus and deduction breakdown — export exactly what the filters show.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 rounded-sm text-[12px]" disabled={!!busy}>
              {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Download className="mr-1.5 size-3.5" />}
              {busy ? "Exporting…" : "Export"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem disabled={!!busy} onSelect={(e) => { e.preventDefault(); void doExport("pdf"); }}>
              <FileText className="mr-2 size-3.5" /> PDF report
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!!busy} onSelect={(e) => { e.preventDefault(); void doExport("xlsx"); }}>
              <FileSpreadsheet className="mr-2 size-3.5" /> Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!!busy} onSelect={(e) => { e.preventDefault(); void doExport("csv"); }}>
              <FileType className="mr-2 size-3.5" /> CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filters */}
      <div className="rounded-md border border-border bg-card p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <label className="space-y-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">From month</span>
            <Input type="month" value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} className="h-8 rounded-sm text-[12px]" />
          </label>
          <label className="space-y-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">To month</span>
            <Input type="month" value={toMonth} onChange={(e) => setToMonth(e.target.value)} className="h-8 rounded-sm text-[12px]" />
          </label>
          <label className="space-y-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Employee</span>
            <SearchableSelect
              items={employeeItems}
              value={userId ?? ""}
              onChange={(v) => setUserId(v || null)}
              placeholder="All employees"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "all" | "issued" | "void")}
              className="h-8 w-full rounded-sm border border-border bg-background px-2 text-[12px]"
            >
              <option value="all">All</option>
              <option value="issued">Issued</option>
              <option value="void">Void</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Currency</span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="h-8 w-full rounded-sm border border-border bg-background px-2 text-[12px]"
            >
              <option value="BDT">BDT</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Search</span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Slip, name, TrxID…"
              className="h-8 rounded-sm text-[12px]"
            />
          </label>
        </div>
        <div className="mt-2 flex justify-end">
          <Button
            variant="ghost" size="sm" className="h-7 rounded-sm text-[11.5px]"
            onClick={() => {
              setFromMonth(thisMonth()); setToMonth(thisMonth()); setCurrency("BDT");
              setUserId(null); setStatus("all"); setSearch("");
            }}
          >
            <RotateCcw className="mr-1.5 size-3.5" /> Reset filters
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile label="Basic · মূল বেতন" value={fmtMoney(s?.basic ?? 0, currency)} delta="base" positive={null} />
        <KpiTile label="Bonus · বোনাস" value={fmtMoney(s?.bonus ?? 0, currency)} delta="added" positive={true} />
        <KpiTile label="Deduction · কর্তন" value={fmtMoney(s?.deduction ?? 0, currency)} delta="less" positive={false} />
        <KpiTile label="Net paid · নিট প্রদান" value={fmtMoney(s?.net ?? 0, currency)} delta="payable" positive={true} />
        <KpiTile label="Slips · স্লিপ" value={String(s?.count ?? 0)} delta="in range" positive={null} />
      </div>

      <div className="rounded-md border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[12px]">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Slip · স্লিপ</th>
                <th className="px-3 py-2 font-semibold">Employee · কর্মী</th>
                <th className="px-3 py-2 font-semibold">Month · মাস</th>
                <th className="px-3 py-2 text-right font-semibold">Basic · মূল</th>
                <th className="px-3 py-2 text-right font-semibold">Bonus · বোনাস</th>
                <th className="px-3 py-2 text-right font-semibold">Deduction · কর্তন</th>
                <th className="px-3 py-2 text-right font-semibold">Net · নিট</th>
                <th className="px-3 py-2 font-semibold">Method</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center"><Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-[12.5px] text-muted-foreground">No salary slips match the selected filters.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[11.5px]">{r.slip_no ?? "—"}</td>
                    <td className="px-3 py-2">
                      {r.employee}
                      {r.employee_code && <span className="ml-1 font-mono text-[10.5px] text-muted-foreground">{r.employee_code}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[11.5px]">{r.month}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono">{fmtMoney(r.basic, currency)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-emerald-700">{fmtMoney(r.bonus, currency)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-rose-700">{r.deduction ? "-" : ""}{fmtMoney(r.deduction, currency)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold">{fmtMoney(r.net, currency)}</td>
                    <td className="px-3 py-2">{r.payment_method ?? "—"}</td>
                    <td className="px-3 py-2 capitalize">{r.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-3 py-2 text-[11.5px] text-muted-foreground">
          {rows.length} slip{rows.length === 1 ? "" : "s"} · export includes every filtered record
        </div>
      </div>

      {q.isError && (
        <p className="text-[12px] text-rose-600">
          {q.error instanceof Error ? q.error.message : "Could not load the salary report."}
        </p>
      )}
    </div>
  );
}
