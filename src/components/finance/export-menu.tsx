import { useState } from "react";
import { TestLoader } from "@/components/ui/test-loader";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2, FileSpreadsheet, FileText, FileType } from "lucide-react";
import { exportReport } from "@/lib/finance-reports.functions";
import {
  activeFilterChips,
  reportFileBase,
  DATE_PRESETS,
  rangeForPreset,
  type DatePreset,
  type ReportFilters,
} from "@/lib/report-filters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EXPENSE_CATEGORY_KEYS, formatCategory } from "@/lib/expense-categories";

type Format = "pdf" | "xlsx" | "csv";

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

export function ExportMenu({
  filters,
  kind,
  labels,
}: {
  filters: ReportFilters;
  kind: "finance" | "income" | "expense";
  labels?: { client?: string | null; invoice?: string | null; createdBy?: string | null };
}) {
  if (kind === "expense") return <ExpenseExportDialog filters={filters} labels={labels} />;
  return <GenericExportMenu filters={filters} kind={kind} labels={labels} />;
}

function GenericExportMenu({
  filters,
  kind,
  labels,
}: {
  filters: ReportFilters;
  kind: "finance" | "income" | "expense";
  labels?: { client?: string | null; invoice?: string | null; createdBy?: string | null };
}) {
  const run = useServerFn(exportReport);
  const [busy, setBusy] = useState<Format | null>(null);

  const periodLabel =
    filters.preset === "all"
      ? "All time"
      : filters.preset === "custom"
        ? `${filters.from} → ${filters.to}`
        : `${DATE_PRESETS.find((p) => p.key === filters.preset)?.label} (${filters.from} → ${filters.to})`;

  const doExport = async (format: Format) => {
    if (busy) return;
    setBusy(format);
    const t = toast.loading(`Preparing ${format.toUpperCase()} report…`);
    try {
      const res = await run({
        data: {
          from: filters.from,
          to: filters.to,
          currency: filters.currency,
          type: filters.type,
          categories: filters.categories,
          clientId: filters.clientId,
          invoiceId: filters.invoiceId,
          paymentMethod: filters.paymentMethod,
          status: filters.status,
          vendor: filters.vendor,
          department: filters.department,
          createdBy: filters.createdBy,
          minAmount: filters.minAmount,
          maxAmount: filters.maxAmount,
          search: filters.search,
          format,
          kind,
          periodLabel,
          filterLabels: activeFilterChips(filters, labels ?? {}).map((c) => c.label),
          fileBase: reportFileBase(kind, filters),
        },
      });
      download(res.base64, res.mime, res.filename);
      toast.success(`${res.count} record${res.count === 1 ? "" : "s"} exported`, { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed", { id: t });
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 rounded-sm text-[12px]" disabled={!!busy}>
          {busy ? <TestLoader tone="export" className="mr-1.5" /> : <Download className="mr-1.5 size-3.5" />}
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
  );
}

const EXPORT_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "last30", label: "Last 30 days" },
  { key: "last_month", label: "Last month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom range" },
];

function ExpenseExportDialog({
  filters,
  labels,
}: {
  filters: ReportFilters;
  labels?: { client?: string | null; invoice?: string | null; createdBy?: string | null };
}) {
  const run = useServerFn(exportReport);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Format | null>(null);
  const [preset, setPreset] = useState<DatePreset>(filters.preset);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [category, setCategory] = useState<string>(filters.categories[0] ?? "");

  const onOpen = (v: boolean) => {
    if (v) {
      setPreset(filters.preset);
      setFrom(filters.from);
      setTo(filters.to);
      setCategory(filters.categories[0] ?? "");
    }
    setOpen(v);
  };

  const range = preset === "custom" ? { from, to } : rangeForPreset(preset);
  const invalid = preset === "custom" && (!from || !to || from > to);

  const doExport = async (format: Format) => {
    if (busy || invalid) return;
    setBusy(format);
    const t = toast.loading(`Preparing ${format.toUpperCase()} expense report…`);
    const f: ReportFilters = { ...filters, preset, from: range.from, to: range.to, categories: category ? [category] : [] };
    const presetLabel = EXPORT_PRESETS.find((p) => p.key === preset)?.label ?? "";
    const periodLabel = preset === "all" ? "All time" : preset === "custom" ? `${range.from} to ${range.to}` : `${presetLabel} (${range.from} to ${range.to})`;
    const chips = activeFilterChips(f, labels ?? {})
      .filter((c) => c.key !== "date" && c.key !== "type" && c.key !== "categories")
      .map((c) => c.label);
    if (category) chips.unshift(`Category: ${formatCategory(category)}`);
    try {
      const res = await run({
        data: {
          from: f.from, to: f.to, currency: f.currency, type: "expense", categories: f.categories,
          clientId: f.clientId, invoiceId: f.invoiceId, paymentMethod: f.paymentMethod, status: f.status,
          vendor: f.vendor, department: f.department, createdBy: f.createdBy,
          minAmount: f.minAmount, maxAmount: f.maxAmount, search: f.search,
          format, kind: "expense", periodLabel, filterLabels: chips,
          fileBase: `expense-report${category ? `-${category}` : ""}-${preset === "all" ? "all-time" : `${f.from}_${f.to}`}`,
        },
      });
      download(res.base64, res.mime, res.filename);
      toast.success(`${res.count} expense${res.count === 1 ? "" : "s"} exported`, { id: t });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed", { id: t });
    } finally {
      setBusy(null);
    }
  };

  const chip = (active: boolean) =>
    `rounded-[3px] px-2 py-1 text-[11.5px] font-medium transition-colors ${
      active ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"
    }`;

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 rounded-sm text-[12px]" onClick={() => onOpen(true)} disabled={!!busy}>
        {busy ? <TestLoader tone="export" className="mr-1.5" /> : <Download className="mr-1.5 size-3.5" />}
        {busy ? "Exporting…" : "Export"}
      </Button>
      <Dialog open={open} onOpenChange={onOpen}>
        <DialogContent className="max-w-lg rounded-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Export expense report</DialogTitle>
            <DialogDescription className="text-[12px]">
              Choose the period and category. Other filters on this page are applied too.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Period</div>
              <div className="flex flex-wrap gap-1.5">
                {EXPORT_PRESETS.map((p) => (
                  <button key={p.key} type="button" className={chip(preset === p.key)} onClick={() => setPreset(p.key)}>
                    {p.label}
                  </button>
                ))}
              </div>
              {preset === "custom" ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">From</span>
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                      className="h-8 w-full rounded-sm border border-border bg-card px-2 text-[12px] outline-none focus:border-primary" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">To</span>
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                      className="h-8 w-full rounded-sm border border-border bg-card px-2 text-[12px] outline-none focus:border-primary" />
                  </label>
                  {invalid && <p className="col-span-2 text-[11px] text-destructive">Pick a valid From and To date.</p>}
                </div>
              ) : (
                <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                  {preset === "all" ? "All recorded expenses" : `${range.from} → ${range.to}`}
                </p>
              )}
            </div>

            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="h-9 w-full rounded-sm border border-border bg-card px-2 text-[13px] outline-none focus:border-primary">
                <option value="">All categories</option>
                {EXPENSE_CATEGORY_KEYS.map((c) => <option key={c} value={c}>{formatCategory(c)}</option>)}
              </select>
            </label>
          </div>

          <DialogFooter className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:space-x-0">
            <Button disabled={!!busy || invalid} onClick={() => void doExport("pdf")} className="h-9 rounded-sm text-[12.5px]">
              {busy === "pdf" ? <TestLoader tone="export" className="mr-1.5" /> : <FileText className="mr-1.5 size-3.5" />} PDF report
            </Button>
            <Button variant="outline" disabled={!!busy || invalid} onClick={() => void doExport("xlsx")} className="h-9 rounded-sm text-[12.5px]">
              {busy === "xlsx" ? <TestLoader tone="export" className="mr-1.5" /> : <FileSpreadsheet className="mr-1.5 size-3.5" />} Excel
            </Button>
            <Button variant="outline" disabled={!!busy || invalid} onClick={() => void doExport("csv")} className="h-9 rounded-sm text-[12.5px]">
              {busy === "csv" ? <TestLoader tone="export" className="mr-1.5" /> : <FileType className="mr-1.5 size-3.5" />} CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
