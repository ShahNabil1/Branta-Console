import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2, FileSpreadsheet, FileText, FileType } from "lucide-react";
import { exportReport } from "@/lib/finance-reports.functions";
import {
  activeFilterChips,
  reportFileBase,
  DATE_PRESETS,
  type ReportFilters,
} from "@/lib/report-filters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

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
  );
}
