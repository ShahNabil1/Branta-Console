import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { getFinanceSheetSettings, saveFinanceSheetSettings, syncFinanceSheets } from "@/lib/finance-sheets.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, fmtDate, Section } from "@/components/finance/fund-report-kit";

export const Route = createFileRoute("/_authenticated/app/finance/sheets")({
  head: () => ({
    meta: [
      { title: "Finance Google Sheets · Branta Finance" },
      { name: "description", content: "One-way Finance reporting from Branta Console to Google Sheets." },
      { property: "og:title", content: "Finance Google Sheets · Branta Finance" },
      { property: "og:description", content: "One-way Finance reporting to Google Sheets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SheetsPage,
});

function SheetsPage() {
  const get = useServerFn(getFinanceSheetSettings); const save = useServerFn(saveFinanceSheetSettings); const sync = useServerFn(syncFinanceSheets);
  const q = useQuery({ queryKey: ["finance-sheets"], queryFn: () => get() });
  const [link, setLink] = useState("");
  const saveM = useMutation({ mutationFn: () => save({ data: { spreadsheet: link } }), onSuccess: (r) => { toast.success(`Connected: ${r.title}`); setLink(""); void q.refetch(); }, onError: (e) => toast.error((e as Error).message) });
  const syncM = useMutation({
    mutationFn: () => sync({ data: {} }),
    onSuccess: (r) => { const bad = r.results.filter((x) => !x.ok); if (bad.length) toast.error(`Finance Sheet Sync Failed on ${bad.length} tab(s)`); else toast.success(`Synced: ${r.results.reduce((a, x) => a + x.added, 0)} added, ${r.results.reduce((a, x) => a + x.updated, 0)} updated`); void q.refetch(); },
    onError: (e) => { toast.error(`Finance Sheet Sync Failed: ${(e as Error).message}`); void q.refetch(); },
  });
  if (q.isLoading) return <div className="mx-auto max-w-5xl p-6"><div className="h-40 animate-pulse rounded-md bg-muted" /></div>;
  if (q.isError) return <div className="p-6 text-[13px] text-destructive">{(q.error as Error).message}</div>;
  const s = q.data!.settings;
  const failed = s?.last_failure_at && (!s.last_success_at || s.last_failure_at > s.last_success_at);

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-[20px] font-bold">Finance Google Sheets</h1>
        <p className="text-[12.5px] text-muted-foreground">One-way reporting: Branta Console → Google Sheets. Nothing in the spreadsheet is ever read back. Separate from the Leads sheet sync. A failed sync never affects finance data.</p>
      </div>

      <Section title="Spreadsheet">
        {s?.spreadsheet_id ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
            <b>{s.spreadsheet_name}</b><span className="font-mono text-[11.5px] text-muted-foreground">{s.spreadsheet_id}</span>
            <a href={`https://docs.google.com/spreadsheets/d/${s.spreadsheet_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-primary">Open <ExternalLink className="size-3" /></a>
          </div>
        ) : <p className="mb-3 text-[12.5px] text-muted-foreground">No Finance spreadsheet connected yet. Create an empty Google Sheet with the connected Google account and paste its link.</p>}
        <div className="flex flex-wrap gap-2">
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" className="h-9 flex-1 text-[12.5px]" />
          <Button variant="outline" disabled={link.trim().length < 10 || saveM.isPending} onClick={() => saveM.mutate()}>{saveM.isPending && <Loader2 className="mr-1 size-3 animate-spin" />}{s?.spreadsheet_id ? "Change" : "Connect"}</Button>
        </div>
      </Section>

      <Section title="Sync" right={<Button size="sm" disabled={!s?.spreadsheet_id || syncM.isPending} onClick={() => syncM.mutate()}>{syncM.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : <RefreshCw className="mr-1 size-3" />}{failed ? "Retry sync" : "Sync now"}</Button>}>
        <div className="grid gap-2 text-[12.5px] sm:grid-cols-2">
          <div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-600" />Last successful sync: <b>{fmtDate(s?.last_success_at)}</b></div>
          <div className="flex items-center gap-2"><AlertTriangle className="size-4 text-amber-600" />Last failed sync: <b>{fmtDate(s?.last_failure_at)}</b></div>
        </div>
        {failed && <div className="mt-2 rounded-sm border border-amber-300 bg-amber-50 p-2 text-[12px]"><b>Finance Sheet Sync Failed.</b> {s?.last_error}</div>}
        <p className="mt-2 text-[11.5px] text-muted-foreground">Tabs: {q.data!.tabs.join(" · ")}. Rows are matched by a stable ID in column A — re-syncing updates rows in place and never duplicates. Sync is manual (Sync now); a scheduled sync is not enabled because it would need a background admin key.</p>
      </Section>

      <Section title="Sync log">
        <DataTable cols={[
          { h: "Started", c: (r: any) => fmtDate(r.started_at) }, { h: "Tab", c: (r: any) => r.tab },
          { h: "Status", c: (r: any) => <span className={r.status === "failed" ? "text-destructive" : r.status === "success" ? "text-emerald-700" : ""}>{r.status}</span> },
          { h: "Rows", right: true, c: (r: any) => r.rows_processed }, { h: "Added", right: true, c: (r: any) => r.rows_added }, { h: "Updated", right: true, c: (r: any) => r.rows_updated },
          { h: "Error", c: (r: any) => <span className="text-[11.5px] text-destructive">{r.error ?? ""}</span> },
        ]} rows={q.data!.logs} empty="No syncs yet." />
      </Section>
    </div>
  );
}
