import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarIcon, Download, FileSpreadsheet, FileText } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { getMyPermissions } from "@/lib/permissions.functions";
import { getFinanceExport } from "@/lib/finance-export.functions";
import {
  deliverFinanceFile,
  financeFilename,
  financeSummary,
  moneyLabel,
} from "@/lib/finance-export";

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-start" aria-label={`${label} date`}>
            <CalendarIcon />
            {value ? format(value, "dd/MM/yyyy") : "All time"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="z-[60] w-auto bg-popover p-0 pointer-events-auto">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(d) => {
              onChange(d);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
export function FinanceExportButton() {
  const permissionsFn = useServerFn(getMyPermissions);
  const permissions = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => permissionsFn(),
    staleTime: 30_000,
  });
  if (!permissions.data?.isAdmin) return null;
  return <FinanceExportDialog />;
}
export function FinanceExportDialog() {
  const [open, setOpen] = useState(false),
    [from, setFrom] = useState<Date>(),
    [to, setTo] = useState<Date>();
  const [files, setFiles] = useState<{ xlsx: Blob; pdf: Blob; key: string }>(),
    [error, setError] = useState<string>(),
    [pending, setPending] = useState(false);
  const fromDay = from ? format(from, "yyyy-MM-dd") : null,
    toDay = to ? format(to, "yyyy-MM-dd") : null;
  const valid = !fromDay || !toDay || fromDay <= toDay,
    key = `${fromDay}/${toDay}`;
  const fetchReport = useServerFn(getFinanceExport);
  const query = useQuery({
    queryKey: ["finance-export", fromDay, toDay],
    queryFn: () => fetchReport({ data: { from: fromDay, to: toDay } }),
    enabled: open && valid,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  useEffect(() => {
    let active = true;
    setFiles(undefined);
    setError(undefined);
    if (!query.data || query.isFetching || !valid) return;
    void import("@/lib/finance-export-xlsx")
      .then(({ buildFinanceExcel }) => {
        const bytes = buildFinanceExcel(query.data.report);
        const pdfBytes = Uint8Array.from(atob(query.data.pdfBase64), (c) => c.charCodeAt(0));
        if (active)
          setFiles({
            key,
            xlsx: new Blob([Uint8Array.from(bytes).buffer], {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }),
            pdf: new Blob([pdfBytes], { type: "application/pdf" }),
          });
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "Could not prepare files.");
      });
    return () => {
      active = false;
    };
  }, [query.data, query.isFetching, key, valid]);
  const download = async (ext: "xlsx" | "pdf") => {
    if (!files || files.key !== key || !query.data) return;
    setPending(true);
    setError(undefined);
    try {
      await deliverFinanceFile(files[ext], financeFilename(query.data.report, ext));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed. Please retry.");
    } finally {
      setPending(false);
    }
  };
  const ready = !!files && files.key === key && !query.isFetching && valid;
  const sum = query.data ? financeSummary(query.data.report) : null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Download />
        Export Finance Report
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Export Finance Report</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              BDT · {query.data?.report.companyName ?? "Branta Tech"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom(undefined);
                setTo(undefined);
              }}
            >
              All time
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DateField label="From" value={from} onChange={setFrom} />
            <DateField label="To" value={to} onChange={setTo} />
          </div>
          {!valid && (
            <p role="alert" className="text-sm text-destructive">
              From date must be on or before To date.
            </p>
          )}
          {sum && valid && !query.isFetching && (
            <dl className="grid grid-cols-3 gap-3 border-y border-border py-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Total Income</dt>
                <dd className="mt-1 font-mono font-semibold">{moneyLabel(sum.income)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Total Expense</dt>
                <dd className="mt-1 font-mono font-semibold">{moneyLabel(sum.expense)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Net Profit / Loss</dt>
                <dd
                  className={`mt-1 font-mono font-semibold ${sum.net < 0 ? "text-destructive" : "text-foreground"}`}
                >
                  {moneyLabel(sum.net)}
                </dd>
              </div>
            </dl>
          )}
          {(error || query.error) && (
            <div role="alert" className="text-sm text-destructive">
              {error || query.error?.message}
              <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {query.data?.report.missingFields.map((field) => (
            <p key={field} className="text-xs text-muted-foreground">
              Not recorded: {field}
            </p>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!ready || pending}
              loading={query.isFetching}
              onClick={() => void download("xlsx")}
            >
              <FileSpreadsheet />
              Download Excel (.xlsx)
            </Button>
            <Button
              variant="outline"
              disabled={!ready || pending}
              onClick={() => void download("pdf")}
            >
              <FileText />
              Download PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
