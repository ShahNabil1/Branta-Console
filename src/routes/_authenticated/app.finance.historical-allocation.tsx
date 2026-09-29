import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, Trash2, X } from "lucide-react";
import { allocateHistorical, listHistorical, previewHistorical, reverseHistorical } from "@/lib/historical-allocation.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { bdt, DateRangeBar, fmtDay, Section, Select, Tile, useDateRange, usd } from "@/components/finance/fund-report-kit";

export const Route = createFileRoute("/_authenticated/app/finance/historical-allocation")({
  head: () => ({
    meta: [
      { title: "Historical Allocation · Branta Finance" },
      { name: "description", content: "Review and allocate legacy paid installments into the Branta Fund Ledger." },
      { property: "og:title", content: "Historical Allocation · Branta Finance" },
      { property: "og:description", content: "Reviewed historical Fund Ledger allocation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoricalPage,
});

type Row = Awaited<ReturnType<typeof listHistorical>>["rows"][number];
const STATUSES = ["Legacy / Not Allocated", "Allocation Required", "Reversed", "Allocated"];
const DED_TYPES = ["Gateway Fee", "Broker", "External Vendor", "Production Cost", "Other Direct Deduction"];

function HistoricalPage() {
  const fn = useServerFn(listHistorical);
  const dr = useDateRange("all");
  const [f, setF] = useState<{ customerId: string | null; projectId: string | null; invoiceId: string | null; status: string | null; currency: "BDT" | "USD" | null }>({ customerId: null, projectId: null, invoiceId: null, status: null, currency: null });
  const [search, setSearch] = useState(""); const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<string[] | null>(null);
  const [reverse, setReverse] = useState<Row | null>(null);
  const params = { from: dr.range.from, to: dr.range.to, ...f, search: search.trim() || null, page, pageSize: 50 };
  const q = useQuery({ queryKey: ["historical", params], queryFn: () => fn({ data: params }), placeholderData: keepPreviousData });
  if (q.isLoading) return <div className="mx-auto max-w-7xl p-6"><div className="h-64 animate-pulse rounded-md bg-muted" /></div>;
  if (q.isError) return <div className="p-6 text-[13px] text-destructive">{(q.error as Error).message}</div>;
  const d = q.data!; const p = d.progress;
  const pages = Math.max(1, Math.ceil(d.total / 50));
  const toggle = (id: string) => { const s = new Set(sel); if (s.has(id)) s.delete(id); else if (s.size < 50) s.add(id); else toast.error("Max 50 per batch"); setSel(s); };

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[20px] font-bold">Historical Allocation</h1>
          <p className="max-w-3xl text-[12.5px] text-muted-foreground">Old paid installments are never allocated automatically. Each allocation is previewed and confirmed by Finance; source invoices and payments are not changed — only new allocation and Fund Ledger rows are created. USD payments are not eligible (no stored BDT conversion).</p>
        </div>
        {q.isFetching && <Loader2 className="size-4 animate-spin" />}
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 lg:grid-cols-7">
        <Tile label="Legacy paid installments" value={String(p.legacy)} onClick={() => setF({ ...f, status: null })} />
        <Tile label="Eligible" value={String(p.eligible)} />
        <Tile label="Allocated historically" value={String(p.allocatedHistorically)} onClick={() => setF({ ...f, status: "Allocated" })} />
        <Tile label="Needs review" value={String(p.needsReview)} tone={p.needsReview ? "warn" : undefined} />
        <Tile label="USD / not eligible" value={String(p.notEligible)} onClick={() => setF({ ...f, currency: "USD" })} />
        <Tile label="Remaining legacy" value={bdt(p.remainingBdt)} hint={p.remainingUsd ? `+ ${usd(p.remainingUsd)} (not eligible)` : undefined} />
        <Tile label="Historical allocated" value={bdt(p.historicalAmount)} />
      </div>

      <div className="space-y-2 rounded-md border border-border bg-card p-3">
        <DateRangeBar state={dr} />
        <div className="flex flex-wrap gap-1.5">
          <Select value={f.customerId} onChange={(v) => { setF({ ...f, customerId: v }); setPage(0); }} options={d.options.clients} placeholder="All clients" />
          <Select value={f.projectId} onChange={(v) => { setF({ ...f, projectId: v }); setPage(0); }} options={d.options.projects} placeholder="All projects" />
          <Select value={f.invoiceId} onChange={(v) => { setF({ ...f, invoiceId: v }); setPage(0); }} options={d.options.invoices} placeholder="All invoices" />
          <Select value={f.status} onChange={(v) => { setF({ ...f, status: v }); setPage(0); }} options={STATUSES.map((s) => ({ id: s, label: s }))} placeholder="Unallocated + historical" />
          <Select value={f.currency} onChange={(v) => { setF({ ...f, currency: v as "BDT" | "USD" | null }); setPage(0); }} options={[{ id: "BDT", label: "BDT" }, { id: "USD", label: "USD" }]} placeholder="Any currency" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search client, project, invoice, reference…" className="h-8 w-64 rounded-sm text-[12px]" />
        </div>
      </div>

      <Section title={`${d.total} installments`} right={sel.size > 0 && <div className="flex gap-2"><Button size="sm" variant="ghost" className="h-7" onClick={() => setSel(new Set())}>Clear</Button><Button size="sm" className="h-7" onClick={() => setPreview([...sel])}>Bulk preview ({sel.size})</Button></div>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-[12.5px]">
            <thead><tr className="border-b border-border text-left text-[11px] uppercase text-muted-foreground">
              {["", "Date", "Client", "Project", "Invoice", "Installment", "Amount", "Status", "Eligibility", "Reason", "Action"].map((h) => <th key={h} className="px-2 py-2">{h}</th>)}
            </tr></thead>
            <tbody>
              {d.rows.length === 0 && <tr><td colSpan={11} className="py-6 text-center text-muted-foreground">Nothing here.</td></tr>}
              {d.rows.map((r) => {
                const can = r.status !== "Allocated" && r.currency === "BDT";
                return (
                  <tr key={r.installment_id} className="border-b border-border/60 align-top hover:bg-muted/40">
                    <td className="px-2 py-1.5"><input type="checkbox" disabled={!can} checked={sel.has(r.installment_id)} onChange={() => toggle(r.installment_id)} /></td>
                    <td className="px-2 py-1.5">{fmtDay(r.paid_at)}</td>
                    <td className="px-2 py-1.5">{r.client ?? "—"}</td>
                    <td className="px-2 py-1.5">{r.project ?? "—"}</td>
                    <td className="px-2 py-1.5"><Link to="/app/finance/invoices/$slug" params={{ slug: r.invoice_slug }} className="font-mono text-primary">{r.invoice_slug}</Link></td>
                    <td className="px-2 py-1.5">{r.label}{r.is_partial && <span className="ml-1 text-[10.5px] text-muted-foreground">(partial)</span>}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{r.currency === "USD" ? usd(r.amount) : bdt(r.amount)}</td>
                    <td className="px-2 py-1.5">{r.status}{r.active_source === "historical" && <div className="text-[10.5px] text-muted-foreground">historical</div>}</td>
                    <td className={cn("px-2 py-1.5", r.eligibility === "Eligible" ? "text-emerald-700" : r.eligibility === "Needs review" ? "text-amber-700" : "text-muted-foreground")}>{r.eligibility}{r.warnings.length > 0 && <div className="text-[10.5px]">{r.warnings.join(" · ")}</div>}</td>
                    <td className="max-w-[200px] px-2 py-1.5 text-[11.5px] text-muted-foreground">{r.reason ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      {can && <Button size="sm" variant="outline" className="h-7 text-[11.5px]" onClick={() => setPreview([r.installment_id])}>Generate allocation</Button>}
                      {r.active_source === "historical" && r.active_allocation_id && <Button size="sm" variant="ghost" className="h-7 text-[11.5px] text-destructive" onClick={() => setReverse(r)}>Reverse</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex items-center justify-end gap-2 text-[12px]">
          <Button size="sm" variant="outline" className="h-7" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
          <span>Page {page + 1} / {pages}</span>
          <Button size="sm" variant="outline" className="h-7" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </Section>

      {preview && <PreviewDialog ids={preview} onClose={(done) => { setPreview(null); if (done) setSel(new Set()); }} />}
      {reverse && <ReverseDialog row={reverse} onClose={() => setReverse(null)} />}
    </div>
  );
}

type Ded = { name: string; amount: number };

function PreviewDialog({ ids, onClose }: { ids: string[]; onClose: (done: boolean) => void }) {
  const qc = useQueryClient();
  const pv = useServerFn(previewHistorical); const al = useServerFn(allocateHistorical);
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [deds, setDeds] = useState<Record<string, Ded[]>>({});
  const [reason, setReason] = useState("Historical Fund Ledger Migration");
  const [confirmed, setConfirmed] = useState(false);
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const items = ids.map((id) => ({ installmentId: id, versionId: versions[id] ?? null, deductions: deds[id] ?? null }));
  const q = useQuery({ queryKey: ["hist-preview", items], queryFn: () => pv({ data: { items } }), placeholderData: keepPreviousData });
  const m = useMutation({
    mutationFn: (list: { installmentId: string; versionId: string; deductions: Ded[] }[]) => al({ data: { reason, items: list } }),
    onSuccess: (res) => {
      const ok = res.results.filter((r) => r.ok).length; const bad = res.results.filter((r) => !r.ok);
      if (ok) toast.success(`${ok} allocation${ok > 1 ? "s" : ""} created`);
      bad.forEach((b) => toast.error(b.error ?? "Failed"));
      void qc.invalidateQueries();
      onClose(true);
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const d = q.data;
  const ready = (d?.previews ?? []).filter((p: any) => !p.blocked && (include[p.installmentId] ?? !p.needsReview));
  const totals = ready.reduce((a: any, p: any) => { a.recv += p.row.amount; a.ded += p.deductionTotal; a.dist += p.distributable; p.items.forEach((i: any) => { a.funds[i.fund] = (a.funds[i.fund] ?? 0) + i.amount; }); return a; }, { recv: 0, ded: 0, dist: 0, funds: {} as Record<string, number> });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => onClose(false)}>
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[16px] font-bold">{ids.length > 1 ? "Bulk historical allocation preview" : "Historical allocation preview"}</h2><Button size="icon" variant="ghost" onClick={() => onClose(false)}><X className="size-4" /></Button></div>
        {!d && <Loader2 className="size-5 animate-spin" />}
        {d && (
          <div className="space-y-3">
            {ids.length > 1 && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Tile label="Payments included" value={`${ready.length} / ${ids.length}`} />
                <Tile label="Total received" value={bdt(totals.recv)} />
                <Tile label="Total deductions" value={bdt(totals.ded)} />
                <Tile label="Total distributable" value={bdt(totals.dist)} />
              </div>
            )}
            {ids.length > 1 && Object.keys(totals.funds).length > 0 && (
              <Section title="Total allocation per fund"><div className="grid grid-cols-2 gap-1 text-[12px] md:grid-cols-3">{Object.entries(totals.funds).map(([k, v]) => <div key={k} className="flex justify-between"><span>{k}</span><span className="font-mono">{bdt(v as number)}</span></div>)}</div></Section>
            )}
            {d.previews.map((p: any) => (
              <div key={p.installmentId} className={cn("rounded-md border p-3", p.blocked ? "border-destructive/40 opacity-70" : p.needsReview ? "border-amber-300" : "border-border")}>
                {p.error ? <div className="text-[12.5px] text-destructive">{p.error}</div> : <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="text-[12.5px]">
                      <div className="font-semibold">{p.row.client ?? "No client"} · {p.row.project ?? "No project"}</div>
                      <div className="text-muted-foreground">{p.row.invoice_slug} · {p.row.label} · paid {fmtDay(p.row.paid_at)} · <b className="font-mono text-foreground">{p.row.currency === "USD" ? usd(p.row.amount) : bdt(p.row.amount)}</b> {p.row.currency}</div>
                    </div>
                    {!p.blocked && p.needsReview && <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={include[p.installmentId] ?? false} onChange={(e) => setInclude({ ...include, [p.installmentId]: e.target.checked })} /> Reviewed — include</label>}
                  </div>
                  {p.warnings.length > 0 && <div className="mt-1 flex items-start gap-1 text-[11.5px] text-amber-800"><AlertTriangle className="mt-0.5 size-3 shrink-0" />{p.warnings.join(" · ")}</div>}
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">Allocation version</div>
                      <select className="h-8 w-full rounded-sm border border-border bg-card px-2 text-[12px]" value={p.version?.id ?? ""} onChange={(e) => setVersions({ ...versions, [p.installmentId]: e.target.value })}>
                        <option value="">Select version…</option>
                        {d.versions.map((v: any) => <option key={v.id} value={v.id}>{v.name} (from {v.effective_from}){p.suggestedVersion?.id === v.id ? " — suggested" : ""}</option>)}
                      </select>
                      <div className="mt-1 text-[11px] text-muted-foreground">Payment date {(p.row.paid_at ?? "").slice(0, 10) || "—"}{p.version && <> · version effective {p.version.effective_from}</>}</div>
                      <div className="mt-2 mb-1 text-[11px] font-semibold uppercase text-muted-foreground">Direct deductions (BDT)</div>
                      {(deds[p.installmentId] ?? p.deductions).map((x: Ded, i: number) => (
                        <div key={i} className="mb-1 flex gap-1">
                          <select className="h-7 flex-1 rounded-sm border border-border bg-card px-1 text-[12px]" value={x.name} onChange={(e) => { const l = [...(deds[p.installmentId] ?? p.deductions)]; l[i] = { ...x, name: e.target.value }; setDeds({ ...deds, [p.installmentId]: l }); }}>
                            {[...new Set([...DED_TYPES, x.name])].map((t) => <option key={t}>{t}</option>)}
                          </select>
                          <Input type="number" min={0} className="h-7 w-28 text-[12px]" value={x.amount} onChange={(e) => { const l = [...(deds[p.installmentId] ?? p.deductions)]; l[i] = { ...x, amount: Math.max(0, Number(e.target.value) || 0) }; setDeds({ ...deds, [p.installmentId]: l }); }} />
                          <Button size="icon" variant="ghost" className="size-7" onClick={() => setDeds({ ...deds, [p.installmentId]: (deds[p.installmentId] ?? p.deductions).filter((_: Ded, j: number) => j !== i) })}><Trash2 className="size-3" /></Button>
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" className="h-7 text-[11.5px]" onClick={() => setDeds({ ...deds, [p.installmentId]: [...(deds[p.installmentId] ?? p.deductions), { name: "Gateway Fee", amount: 0 }] })}><Plus className="mr-1 size-3" />Add deduction</Button>
                    </div>
                    <div className="text-[12px]">
                      <div className="flex justify-between"><span>Received</span><span className="font-mono">{bdt(p.row.amount)}</span></div>
                      <div className="flex justify-between"><span>− Deductions</span><span className="font-mono">{bdt(p.deductionTotal)}</span></div>
                      <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Distributable</span><span className="font-mono">{bdt(p.distributable)}</span></div>
                      <div className="mt-2 space-y-0.5">{p.items.map((i: any) => <div key={i.fund_id} className="flex justify-between text-muted-foreground"><span>{i.fund} · {i.percent}%</span><span className="font-mono text-foreground">{bdt(i.amount)}</span></div>)}</div>
                    </div>
                  </div>
                </>}
              </div>
            ))}
            <div className="space-y-2 rounded-md border border-border bg-card p-3 text-[12.5px]">
              <div className="font-semibold">You are about to create Fund Ledger allocations for {ready.length} historical paid installment{ready.length === 1 ? "" : "s"}.</div>
              <div className="text-muted-foreground">Historical source records will remain unchanged. Only new allocation and Fund Ledger records will be created. Blocked items and unreviewed warnings are excluded.</div>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[60px] text-[12.5px]" placeholder="Reason (min 5 characters)" />
              <label className="flex items-center gap-2"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I confirm the version and deductions above.</label>
              <Button disabled={!confirmed || reason.trim().length < 5 || ready.length === 0 || m.isPending || q.isFetching}
                onClick={() => m.mutate(ready.map((p: any) => ({ installmentId: p.installmentId, versionId: p.version.id, deductions: (deds[p.installmentId] ?? p.deductions).filter((x: Ded) => x.amount > 0) })))}>
                {m.isPending && <Loader2 className="mr-1 size-3 animate-spin" />}Create {ready.length} allocation{ready.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReverseDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const qc = useQueryClient(); const fn = useServerFn(reverseHistorical);
  const [reason, setReason] = useState("");
  const m = useMutation({ mutationFn: () => fn({ data: { allocationId: row.active_allocation_id!, reason } }), onSuccess: () => { toast.success("Allocation reversed"); void qc.invalidateQueries(); onClose(); }, onError: (e) => toast.error((e as Error).message) });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-md bg-background p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[15px] font-bold">Reverse historical allocation</h2>
        <p className="text-[12.5px] text-muted-foreground">{row.invoice_slug} · {row.label} · {bdt(row.amount)}. The original stays in history; reversal entries are added and the installment becomes eligible again.</p>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (min 5 characters)" />
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="destructive" disabled={reason.trim().length < 5 || m.isPending} onClick={() => m.mutate()}>Reverse</Button></div>
      </div>
    </div>
  );
}
