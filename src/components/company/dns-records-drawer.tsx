import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Cloud, CloudOff, Copy, Pencil, Plus, RefreshCw, Search, Trash2, X, Globe } from "lucide-react";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ExpenseDrawerContent, ExpenseDrawerHeader } from "@/components/finance/expense-drawer";
import { SearchableSelect } from "@/components/finance/searchable-select";
import { ConfirmSurface } from "@/components/ui/confirm-surface";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TestLoader } from "@/components/ui/test-loader";
import { cn } from "@/lib/utils";
import { deleteDnsRecord, listCloudflareZones, listDnsRecords, saveDnsRecord, type DnsRecord } from "@/lib/company-cloudflare.functions";
import { isProxiable } from "@/lib/cloudflare-dns";

const err = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
const ALL_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "HTTPS", "SVCB", "PTR", "CERT", "DNSKEY", "DS", "LOC", "NAPTR", "OPENPGPKEY", "SMIMEA", "SSHFP", "TLSA", "URI"];
const DATA_TYPES = new Set(["SRV", "CAA", "CERT", "DNSKEY", "DS", "LOC", "NAPTR", "SMIMEA", "SSHFP", "TLSA", "URI", "HTTPS", "SVCB"]);
const TTLS = [[1, "Auto"], [60, "1 min"], [120, "2 min"], [300, "5 min"], [600, "10 min"], [1800, "30 min"], [3600, "1 hr"], [7200, "2 hr"], [18000, "5 hr"], [43200, "12 hr"], [86400, "1 day"]] as const;
const ttlLabel = (t: number) => TTLS.find(([v]) => v === t)?.[1] ?? `${t}s`;

type Form = { type: string; name: string; content: string; ttl: number; proxied: boolean; priority: string; comment: string; data: string };
const toForm = (r?: DnsRecord): Form => ({
  type: r?.type ?? "A", name: r?.name ?? "", content: r?.content ?? "", ttl: r?.ttl ?? 1, proxied: r?.proxied ?? false,
  priority: r?.priority != null ? String(r.priority) : "", comment: r?.comment ?? "", data: r?.data ? JSON.stringify(r.data, null, 2) : "",
});
const same = (a: Form, b: Form) => JSON.stringify(a) === JSON.stringify(b);

export function DnsRecordsDrawer({ slug, open, onOpenChange }: { slug: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const zonesFn = useServerFn(listCloudflareZones);
  const recsFn = useServerFn(listDnsRecords);
  const qc = useQueryClient();
  const zones = useQuery({ queryKey: ["cf-zones", slug], queryFn: () => zonesFn({ data: { slug } }), enabled: open, staleTime: 5 * 60_000 });
  const [zone, setZone] = useState("");
  useEffect(() => { if (!zone && zones.data?.length) setZone(zones.data[0].id); }, [zones.data, zone]);
  const recs = useQuery({ queryKey: ["cf-dns", slug, zone], queryFn: () => recsFn({ data: { slug, zone } }), enabled: open && !!zone, staleTime: 60_000 });
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<DnsRecord | "new" | null>(null);
  const [del, setDel] = useState<DnsRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const delFn = useServerFn(deleteDnsRecord);
  const zoneName = zones.data?.find((z) => z.id === zone)?.name ?? "";
  useEffect(() => { setFilter("ALL"); setEditing(null); }, [zone]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recs.data ?? []) m.set(r.type, (m.get(r.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => (ALL_TYPES.indexOf(a[0]) + 1 || 99) - (ALL_TYPES.indexOf(b[0]) + 1 || 99));
  }, [recs.data]);
  useEffect(() => { if (filter !== "ALL" && !counts.some(([t]) => t === filter)) setFilter("ALL"); }, [counts, filter]);
  const shown = (recs.data ?? []).filter((r) => (filter === "ALL" || r.type === filter)
    && (!search || `${r.name} ${r.content}`.toLowerCase().includes(search.toLowerCase())));
  const refresh = () => qc.invalidateQueries({ queryKey: ["cf-dns", slug, zone] });

  const runDelete = async () => {
    if (!del) return;
    setDeleting(true);
    try { await delFn({ data: { slug, zone, id: del.id } }); toast.success(`${del.type} record ${del.name} deleted.`); setDel(null); await refresh(); }
    catch (e) { toast.error(err(e)); } finally { setDeleting(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <ExpenseDrawerContent>
        <ExpenseDrawerHeader>
          <SheetTitle className="flex items-center gap-2 text-[16px] font-bold"><Globe className="size-4 text-muted-foreground" /> DNS records</SheetTitle>
          <SheetDescription className="text-[12px] font-semibold">Manage every DNS record of this company's Cloudflare domains.</SheetDescription>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {zones.isLoading ? <span className="text-[12px] font-semibold text-muted-foreground">Loading domains…</span>
              : (zones.data?.length ?? 0) > 1
                ? <SearchableSelect className="min-w-56 flex-1" items={zones.data!.map((z) => ({ value: z.id, label: z.name }))} value={zone} onChange={(v) => v && setZone(v)} />
                : zoneName && <span className="rounded-md border border-border bg-card px-3 py-1.5 font-mono text-[12.5px] font-bold">{zoneName}</span>}
            <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={!zone || recs.isFetching}><RefreshCw className={cn("size-3.5", recs.isFetching && "animate-spin")} /> Refresh</Button>
            <Button size="sm" onClick={() => setEditing("new")} disabled={!zone || editing === "new"}><Plus className="size-3.5" /> Add record</Button>
          </div>
        </ExpenseDrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {zones.error && <p className="text-[12.5px] font-semibold text-destructive">{err(zones.error)}</p>}
          {zones.data && !zones.data.length && <p className="text-[12.5px] font-semibold text-muted-foreground">No domains found in this Cloudflare account.</p>}
          {editing === "new" && <RecordEditor key="new" slug={slug} zone={zone} zoneName={zoneName} onDone={() => { setEditing(null); void refresh(); }} onCancel={() => setEditing(null)} />}

          {zone && (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                <TypeChip label="All" count={recs.data?.length ?? 0} on={filter === "ALL"} onClick={() => setFilter("ALL")} />
                {counts.map(([t, n]) => <TypeChip key={t} label={t} count={n} on={filter === t} onClick={() => setFilter(t)} />)}
              </div>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or content" className="h-8 pl-8 text-[12.5px]" />
              </div>
              {recs.isLoading && <p className="text-[12.5px] font-semibold text-muted-foreground">Loading records…</p>}
              {recs.error && <p className="text-[12.5px] font-semibold text-destructive">{err(recs.error)}</p>}
              {recs.data && !shown.length && <p className="text-[12.5px] font-semibold text-muted-foreground">No records match.</p>}
              <div className="grid gap-2">
                {shown.map((r, i) => editing !== "new" && editing?.id === r.id
                  ? <RecordEditor key={r.id} slug={slug} zone={zone} zoneName={zoneName} record={r} onDone={() => { setEditing(null); void refresh(); }} onCancel={() => setEditing(null)} />
                  : <RecordCard key={r.id} r={r} i={i} onEdit={() => setEditing(r)} onDelete={() => setDel(r)} />)}
              </div>
            </>
          )}
        </div>

        <ConfirmSurface
          open={!!del}
          tone="danger"
          icon={Trash2}
          title="Delete this DNS record?"
          subject={del && <span className="font-mono">{del.type} · {del.name}</span>}
          points={[
            <span key="c" className="break-all">Content: <b className="font-mono">{del?.content || "—"}</b></span>,
            "Traffic or email using this record stops resolving once DNS updates (usually within minutes).",
            "This can't be undone — re-add the record to restore it.",
          ]}
          confirmLabel="Delete"
          busy={deleting}
          onCancel={() => setDel(null)}
          onConfirm={() => void runDelete()}
        />
      </ExpenseDrawerContent>
    </Sheet>
  );
}

function TypeChip({ label, count, on, onClick }: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-all active:scale-95",
        on ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:-translate-y-0.5 hover:shadow-sm")}>
      {label}<span className={cn("rounded-full px-1.5 font-mono text-[10.5px]", on ? "bg-primary/15" : "bg-muted text-muted-foreground")}>{count}</span>
    </button>
  );
}

function RecordCard({ r, i, onEdit, onDelete }: { r: DnsRecord; i: number; onEdit: () => void; onDelete: () => void }) {
  const long = r.content.length > 60;
  const copy = (v: string) => { void navigator.clipboard.writeText(v); toast.success("Copied."); };
  return (
    <div style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
      className="group rounded-lg border border-border bg-card p-3 shadow-sm transition-all hover:shadow-md animate-in fade-in slide-in-from-bottom-1 fill-mode-both">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 min-w-14 rounded-md border border-border bg-background px-1.5 py-0.5 text-center font-mono text-[11px] font-extrabold">{r.type}</span>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => copy(r.name)} className="flex max-w-full items-center gap-1 truncate font-mono text-[12.5px] font-bold hover:text-primary">
            <span className="truncate">{r.name}</span><Copy className="size-3 shrink-0 opacity-0 group-hover:opacity-60" />
          </button>
          {long ? (
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="block max-w-full truncate text-left font-mono text-[12px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground">{r.content}</button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(32rem,90vw)]">
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-[11.5px]">{r.content}</pre>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => copy(r.content)}><Copy className="size-3.5" /> Copy</Button>
              </PopoverContent>
            </Popover>
          ) : <div className="truncate font-mono text-[12px] text-muted-foreground">{r.content || "—"}</div>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
            {r.proxiable || r.proxied
              ? r.proxied
                ? <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary"><Cloud className="size-3" /> Proxied</span>
                : <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground"><CloudOff className="size-3" /> DNS only</span>
              : <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">DNS only</span>}
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">TTL {ttlLabel(r.ttl)}</span>
            {r.priority != null && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">Priority {r.priority}</span>}
            {r.comment && <span className="truncate rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{r.comment}</span>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="outline" className="h-7" onClick={onEdit}><Pencil className="size-3" /> Edit</Button>
          <Button size="sm" variant="outline" className="h-7 text-destructive hover:text-destructive" onClick={onDelete}><Trash2 className="size-3" /> Delete</Button>
        </div>
      </div>
    </div>
  );
}

function RecordEditor({ slug, zone, zoneName, record, onDone, onCancel }: {
  slug: string; zone: string; zoneName: string; record?: DnsRecord; onDone: () => void; onCancel: () => void;
}) {
  const initial = useMemo(() => toForm(record), [record]);
  const [f, setF] = useState<Form>(initial);
  const [saving, setSaving] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  const save = useServerFn(saveDnsRecord);
  const dirty = !same(f, initial);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const dataType = DATA_TYPES.has(f.type);
  const proxiable = isProxiable(f.type);
  const needsPriority = f.type === "MX" || f.type === "URI";
  const cancel = () => (dirty ? setAskCancel(true) : onCancel());

  const submit = async () => {
    let data: Record<string, unknown> | null = null;
    if (dataType && f.data.trim()) {
      try { data = JSON.parse(f.data); } catch { toast.error("Record data must be valid JSON."); return; }
    }
    if (!dataType && !f.content.trim()) { toast.error("Content is required."); return; }
    if (needsPriority && f.priority === "") { toast.error("Priority is required."); return; }
    setSaving(true);
    try {
      await save({ data: { slug, zone, id: record?.id, record: {
        type: f.type, name: f.name.trim() || "@", content: f.content, ttl: f.proxied && proxiable ? 1 : f.ttl, proxied: proxiable && f.proxied,
        priority: f.priority === "" ? null : Number(f.priority), comment: f.comment.trim() || null, data,
      } } });
      toast.success(record ? "DNS record updated." : "DNS record added.");
      onDone();
    } catch (e) { toast.error(err(e)); } finally { setSaving(false); }
  };

  const label = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground";
  return (
    <div className="mb-3 rounded-lg border border-primary/40 bg-card p-4 shadow-md animate-in fade-in zoom-in-95">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-bold">{record ? "Edit record" : "Add record"} <span className="font-mono text-muted-foreground">· {zoneName}</span></div>
        <button type="button" onClick={cancel} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <div>
          <span className={label}>Type</span>
          <SearchableSelect items={ALL_TYPES.map((t) => ({ value: t, label: t }))} value={f.type} onChange={(v) => v && set("type", v)} disabled={!!record && false} />
        </div>
        <div>
          <span className={label}>Name</span>
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="@ or subdomain" className="font-mono text-[12.5px]" />
        </div>
      </div>
      {dataType ? (
        <div className="mt-3">
          <span className={label}>Record data (JSON)</span>
          <textarea value={f.data} onChange={(e) => set("data", e.target.value)} rows={5}
            placeholder={f.type === "SRV" ? '{ "priority": 10, "weight": 5, "port": 443, "target": "host.example.com" }' : f.type === "CAA" ? '{ "flags": 0, "tag": "issue", "value": "letsencrypt.org" }' : "{ }"}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
      ) : (
        <div className="mt-3">
          <span className={label}>{f.type === "TXT" ? "Content (quotes are added automatically)" : "Content"}</span>
          <textarea value={f.content} onChange={(e) => set("content", e.target.value)} rows={f.type === "TXT" ? 3 : 1}
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-[12.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <span className={label}>TTL</span>
          <select value={f.proxied && proxiable ? 1 : f.ttl} disabled={f.proxied && proxiable} onChange={(e) => set("ttl", Number(e.target.value))}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-[12.5px] disabled:opacity-60">
            {TTLS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            {!TTLS.some(([v]) => v === f.ttl) && <option value={f.ttl}>{f.ttl}s</option>}
          </select>
        </div>
        {needsPriority && (
          <div>
            <span className={label}>Priority</span>
            <Input type="number" min={0} max={65535} value={f.priority} onChange={(e) => set("priority", e.target.value)} />
          </div>
        )}
        {proxiable && (
          <label className="flex items-end gap-2 pb-2 text-[12.5px] font-bold">
            <Switch checked={f.proxied} onCheckedChange={(v) => set("proxied", v)} />
            {f.proxied ? <><Cloud className="size-3.5 text-primary" /> Proxied</> : <><CloudOff className="size-3.5 text-muted-foreground" /> DNS only</>}
          </label>
        )}
      </div>
      <div className="mt-3">
        <span className={label}>Comment</span>
        <Input value={f.comment} maxLength={100} onChange={(e) => set("comment", e.target.value)} placeholder="Optional note" />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={cancel} disabled={saving}>Cancel</Button>
        {(dirty || !record) && <Button size="sm" onClick={() => void submit()} disabled={saving || !dirty}><TestLoader active={saving} /> {saving ? "Saving…" : "Save"}</Button>}
      </div>
      <ConfirmSurface
        open={askCancel}
        tone="warning"
        title="Discard your changes?"
        description="The record goes back to how it was before you started editing."
        confirmLabel="Discard"
        onCancel={() => setAskCancel(false)}
        onConfirm={() => { setAskCancel(false); setF(initial); onCancel(); }}
      />
    </div>
  );
}
