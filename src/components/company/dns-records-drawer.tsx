import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown, Cloud, CloudOff, Copy, Globe, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Sheet, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { ExpenseDrawerContent, ExpenseDrawerHeader } from "@/components/finance/expense-drawer";
import { SearchableSelect } from "@/components/finance/searchable-select";
import { ConfirmSurface } from "@/components/ui/confirm-surface";
import { DiscardCancelButton } from "@/components/company/danger-confirm";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { INTEGRATIONS_CLOUDFLARE_ICON as cfIcon } from "@/lib/brand-assets";
import { deleteDnsRecord, listCloudflareZones, listDnsRecords, saveDnsRecord, type DnsRecord } from "@/lib/company-cloudflare.functions";
import { isProxiable } from "@/lib/cloudflare-dns";

const err = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");
const ALL_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "HTTPS", "SVCB", "PTR", "CERT", "DNSKEY", "DS", "LOC", "NAPTR", "OPENPGPKEY", "SMIMEA", "SSHFP", "TLSA", "URI"];
const DATA_TYPES = new Set(["SRV", "CAA", "CERT", "DNSKEY", "DS", "LOC", "NAPTR", "SMIMEA", "SSHFP", "TLSA", "URI", "HTTPS", "SVCB"]);
const TTLS = [[1, "Auto"], [60, "1 min"], [120, "2 min"], [300, "5 min"], [600, "10 min"], [1800, "30 min"], [3600, "1 hr"], [7200, "2 hr"], [18000, "5 hr"], [43200, "12 hr"], [86400, "1 day"]] as const;
const ttlLabel = (t: number) => TTLS.find(([v]) => v === t)?.[1] ?? `${t}s`;
const CONTENT_LABEL: Record<string, string> = { A: "IPv4 address", AAAA: "IPv6 address", CNAME: "Target", MX: "Mail server", TXT: "Value", NS: "Nameserver", PTR: "Domain name" };

/* Shared typography — identical to the company profile page. */
const LABEL = "text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground";
const FIELD_LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
const CONTROL = "w-full rounded-sm border border-input bg-background px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60";

type Form = { type: string; name: string; content: string; ttl: number; proxied: boolean; priority: string; comment: string; data: string };
const toForm = (r?: DnsRecord): Form => ({
  type: r?.type ?? "A", name: r?.name ?? "", content: r?.content ?? "", ttl: r?.ttl ?? 1, proxied: r?.proxied ?? false,
  priority: r?.priority != null ? String(r.priority) : "", comment: r?.comment ?? "", data: r?.data ?? "",
});
const same = (a: Form, b: Form) => JSON.stringify(a) === JSON.stringify(b);
const copy = (v: string) => { void navigator.clipboard.writeText(v); toast.success("Copied."); };

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
  const proxiedCount = (recs.data ?? []).filter((r) => r.proxied).length;
  const refresh = () => qc.invalidateQueries({ queryKey: ["cf-dns", slug, zone] });

  const runDelete = async () => {
    if (!del) return;
    setDeleting(true);
    try { await delFn({ data: { slug, zone, id: del.id } }); toast.success(`${del.type} record ${del.name} deleted.`); setDel(null); await refresh(); }
    catch (e) { toast.error(err(e)); } finally { setDeleting(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <ExpenseDrawerContent className="overflow-hidden">
        <ExpenseDrawerHeader className="relative overflow-hidden px-4 pr-14 sm:px-6 sm:pr-14">
          <span className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-brand/15 blur-3xl" />
          <span className="absolute inset-x-0 top-0 h-1 bg-brand" />
          <div className="relative flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-border bg-card shadow-sm">
              <img src={cfIcon.url} alt="" aria-hidden="true" className="size-6 object-contain" />
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-[18px] font-bold tracking-tight">DNS records</SheetTitle>
              <SheetDescription className="truncate text-[12.5px] font-semibold text-muted-foreground">
                Manage this company's Cloudflare DNS.
              </SheetDescription>
            </div>
          </div>

          <div className="relative mt-4 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
            {zones.isLoading ? (
              <span className="flex h-9 items-center gap-2 rounded-sm border border-border bg-card px-2.5 text-[12.5px] font-semibold text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Loading domains…</span>
            ) : (zones.data?.length ?? 0) > 1 ? (
              <SearchableSelect className="min-w-0" items={zones.data!.map((z) => ({ value: z.id, label: z.name }))} value={zone} onChange={(v) => v && setZone(v)} />
            ) : (
              <span className="flex h-9 min-w-0 items-center gap-2 rounded-sm border border-border bg-card px-2.5 text-[13px] font-bold">
                <Globe className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{zoneName || "No domain"}</span>
              </span>
            )}
            <Button size="sm" variant="outline" aria-label="Refresh records" onClick={() => void refresh()} disabled={!zone || recs.isFetching}
              className="h-9 gap-1.5 px-2.5 text-[12px] font-bold transition-all hover:-translate-y-0.5 hover:border-brand/50 hover:text-brand active:scale-95">
              <RefreshCw className={cn("size-3.5", recs.isFetching && "animate-spin")} /><span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" onClick={() => setEditing("new")} disabled={!zone || editing === "new"}
              className="h-9 gap-1.5 px-3 text-[12px] font-bold shadow-md shadow-brand/25 transition-all hover:-translate-y-0.5 active:scale-95">
              <Plus className="size-3.5" /> <span className="hidden min-[380px]:inline">Add record</span>
            </Button>
          </div>

          {recs.data && (
            <div className="relative mt-3 grid grid-cols-3 gap-2">
              <Stat label="Records" value={recs.data.length} />
              <Stat label="Types" value={counts.length} />
              <Stat label="Proxied" value={proxiedCount} />
            </div>
          )}
        </ExpenseDrawerHeader>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">
          {zones.error && <Notice tone="error">{err(zones.error)}</Notice>}
          {zones.data && !zones.data.length && <Notice>No domains found in this Cloudflare account.</Notice>}
          {editing === "new" && <RecordEditor key="new" slug={slug} zone={zone} zoneName={zoneName} onDone={() => { setEditing(null); void refresh(); }} onCancel={() => setEditing(null)} />}

          {zone && (
            <>
              <div className="mb-3 flex flex-wrap gap-1.5">
                <TypeChip label="All" count={recs.data?.length ?? 0} on={filter === "ALL"} onClick={() => setFilter("ALL")} />
                {counts.map(([t, n]) => <TypeChip key={t} label={t} count={n} on={filter === t} onClick={() => setFilter(t)} />)}
              </div>
              <div className="relative mb-4">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or content" autoComplete="off"
                  className={cn(CONTROL, "h-9 pl-8 font-semibold")} />
              </div>
              {recs.isLoading && (
                <div className="flex flex-col gap-2.5">
                  {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-muted/40" />)}
                </div>
              )}
              {recs.error && <Notice tone="error">{err(recs.error)}</Notice>}
              {recs.data && !shown.length && <Notice>No records match.</Notice>}
              <div className="flex min-w-0 flex-col gap-2.5">
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-card/80 px-3 py-2">
      <div className={cn(LABEL, "truncate")}>{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-bold">{value}</div>
    </div>
  );
}

function Notice({ children, tone }: { children: ReactNode; tone?: "error" }) {
  return (
    <div className={cn("mb-3 rounded-lg border px-3 py-2.5 text-[12.5px] font-semibold",
      tone === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-dashed border-border bg-card text-muted-foreground")}>
      {children}
    </div>
  );
}

function TypeChip({ label, count, on, onClick }: { label: string; count: number; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-all active:scale-95",
        on ? "border-brand/50 bg-brand/10 text-brand" : "border-border bg-card text-foreground hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-sm")}>
      {label}<span className={cn("rounded-full px-1.5 font-mono text-[10.5px]", on ? "bg-brand/15" : "bg-muted text-muted-foreground")}>{count}</span>
    </button>
  );
}

function Pill({ children, tone }: { children: ReactNode; tone?: "brand" }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[10.5px] font-bold",
      tone === "brand" ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground")}>
      {children}
    </span>
  );
}

function RecordCard({ r, i, onEdit, onDelete }: { r: DnsRecord; i: number; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const long = r.content.length > 80;
  return (
    <section style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
      className="group min-w-0 rounded-xl border border-border bg-card p-3.5 shadow-sm transition-all hover:shadow-md animate-in fade-in slide-in-from-bottom-1 fill-mode-both sm:p-4">
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <span className="grid h-8 min-w-11 place-items-center rounded-lg bg-muted px-1.5 font-mono text-[11px] font-bold transition-transform group-hover:scale-105">
          {r.type}
        </span>
        <div className="min-w-0">
          <button type="button" onClick={() => copy(r.name)} title="Copy name"
            className="flex max-w-full items-center gap-1 text-left text-[13px] font-bold tracking-tight transition-colors hover:text-brand">
            <span className="truncate">{r.name}</span><Copy className="size-3 shrink-0 opacity-40 sm:opacity-0 sm:group-hover:opacity-60" />
          </button>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            {r.proxied
              ? <Pill tone="brand"><Cloud className="size-3" /> Proxied</Pill>
              : <Pill><CloudOff className="size-3" /> DNS only</Pill>}
            <Pill>TTL {ttlLabel(r.ttl)}</Pill>
            {r.priority != null && <Pill>Priority {r.priority}</Pill>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="outline" onClick={onEdit} aria-label={`Edit ${r.name}`}
            className="h-7 gap-1 px-2 text-[12px] font-bold transition-all hover:-translate-y-0.5 hover:border-brand/50 hover:text-brand active:scale-95 sm:px-2.5">
            <Pencil className="size-3" /> <span className="hidden min-[400px]:inline">Edit</span>
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete} aria-label={`Delete ${r.name}`}
            className="h-7 gap-1 px-2 text-[12px] font-bold text-destructive transition-all hover:-translate-y-0.5 hover:border-destructive/50 hover:text-destructive active:scale-95 sm:px-2.5">
            <Trash2 className="size-3" /> <span className="hidden min-[400px]:inline">Delete</span>
          </Button>
        </div>
      </header>

      <div className="mt-3 min-w-0 rounded-lg border border-border/70 bg-muted/20 p-3 transition-colors hover:border-brand/30">
        <div className="flex items-center gap-2">
          <span className={cn(LABEL, "flex-1 truncate")}>{CONTENT_LABEL[r.type] ?? "Content"}</span>
          {r.content && (
            <button type="button" onClick={() => copy(r.content)} aria-label="Copy content"
              className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-brand"><Copy className="size-3" /></button>
          )}
        </div>
        <div className={cn("mt-0.5 break-all font-mono text-[12px] font-semibold", !expanded && long && "line-clamp-2")}>{r.content || "—"}</div>
        {long && (
          <button type="button" onClick={() => setExpanded((v) => !v)}
            className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-bold text-muted-foreground transition-colors hover:text-brand">
            {expanded ? "Show less" : "Show all"} <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>
      {r.comment && <p className="mt-2 truncate text-[11.5px] font-semibold text-muted-foreground">{r.comment}</p>}
    </section>
  );
}

function FieldL({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("block min-w-0 space-y-1.5", className)}>
      <span className={FIELD_LABEL}>{label}</span>
      {children}
    </div>
  );
}

function RecordEditor({ slug, zone, zoneName, record, onDone, onCancel }: {
  slug: string; zone: string; zoneName: string; record?: DnsRecord; onDone: () => void; onCancel: () => void;
}) {
  const initial = useMemo(() => toForm(record), [record]);
  const [f, setF] = useState<Form>(initial);
  const [saving, setSaving] = useState(false);
  const save = useServerFn(saveDnsRecord);
  const dirty = !same(f, initial);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const dataType = DATA_TYPES.has(f.type);
  const proxiable = isProxiable(f.type);
  const needsPriority = f.type === "MX" || f.type === "URI";
  const nm = f.name.trim();
  const resolves = !nm || nm === "@" ? zoneName : nm.endsWith(zoneName) ? nm : `${nm}.${zoneName}`;

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

  const ttlItems = [...TTLS.map(([v, l]) => ({ value: String(v), label: l })), ...(!TTLS.some(([v]) => v === f.ttl) ? [{ value: String(f.ttl), label: `${f.ttl}s` }] : [])];

  return (
    <section className="mb-3 min-w-0 rounded-xl border border-brand/50 bg-card p-4 shadow-md ring-2 ring-brand/10 animate-in fade-in zoom-in-95 sm:p-5">
      <header className="mb-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-brand/10 text-brand">
          {record ? <Pencil className="size-4" /> : <Plus className="size-4" />}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-bold tracking-tight">{record ? "Edit record" : "Add record"}</h2>
          <p className="truncate text-[11.5px] font-semibold text-muted-foreground">{zoneName}</p>
        </div>
        <div className="flex gap-1.5">
          <DiscardCancelButton dirty={dirty} onCancel={() => { setF(initial); onCancel(); }} disabled={saving} />
          {(dirty || !record) && (
            <Button size="sm" onClick={() => void submit()} disabled={saving || !dirty}
              className="h-7 gap-1 text-[12px] font-bold shadow-sm shadow-brand/30 active:scale-95">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
          <FieldL label="Type">
            <SearchableSelect items={ALL_TYPES.map((t) => ({ value: t, label: t }))} value={f.type} onChange={(v) => v && set("type", v)} />
          </FieldL>
          <FieldL label="Name">
            <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="@ or subdomain" autoComplete="off" spellCheck={false}
              className={cn(CONTROL, "h-9 font-semibold")} />
            {zoneName && <p className="truncate text-[11px] font-semibold text-muted-foreground">Resolves as <b className="text-foreground">{resolves}</b></p>}
          </FieldL>
        </div>

        {dataType ? (
          <FieldL label="Record data (JSON)">
            <textarea value={f.data} onChange={(e) => set("data", e.target.value)} rows={5} spellCheck={false}
              placeholder={f.type === "SRV" ? '{ "priority": 10, "weight": 5, "port": 443, "target": "host.example.com" }' : f.type === "CAA" ? '{ "flags": 0, "tag": "issue", "value": "letsencrypt.org" }' : "{ }"}
              className={cn(CONTROL, "py-2 font-mono text-[12px]")} />
          </FieldL>
        ) : (
          <FieldL label={CONTENT_LABEL[f.type] ?? "Content"}>
            <textarea value={f.content} onChange={(e) => set("content", e.target.value)} rows={f.type === "TXT" ? 3 : 1} spellCheck={false}
              className={cn(CONTROL, "resize-y py-2 font-mono text-[12.5px]")} />
            {f.type === "TXT" && <p className="text-[11px] font-semibold text-muted-foreground">Quotes are added automatically.</p>}
          </FieldL>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <FieldL label="TTL">
            <SearchableSelect searchable={false} items={ttlItems} value={String(f.proxied && proxiable ? 1 : f.ttl)}
              onChange={(v) => v && set("ttl", Number(v))} disabled={f.proxied && proxiable} />
          </FieldL>
          {needsPriority && (
            <FieldL label="Priority">
              <input type="number" inputMode="numeric" min={0} max={65535} value={f.priority} onChange={(e) => set("priority", e.target.value)}
                className={cn(CONTROL, "h-9 font-mono font-semibold")} />
            </FieldL>
          )}
          {proxiable && (
            <FieldL label="Proxy status" className="col-span-2 sm:col-span-1">
              <label className={cn("flex h-9 cursor-pointer items-center gap-2 rounded-sm border px-2.5 text-[12.5px] font-bold transition-colors",
                f.proxied ? "border-brand/40 bg-brand/5 text-brand" : "border-input bg-background text-muted-foreground")}>
                <Switch checked={f.proxied} onCheckedChange={(v) => set("proxied", v)} />
                {f.proxied ? <><Cloud className="size-3.5" /> Proxied</> : <><CloudOff className="size-3.5" /> DNS only</>}
              </label>
            </FieldL>
          )}
        </div>

        <FieldL label="Comment">
          <input value={f.comment} maxLength={100} onChange={(e) => set("comment", e.target.value)} placeholder="Optional note" autoComplete="off"
            className={cn(CONTROL, "h-9 font-semibold")} />
        </FieldL>
      </div>
    </section>
  );
}
