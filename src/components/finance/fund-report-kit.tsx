import { useState } from "react";
import { TestLoader } from "@/components/ui/test-loader";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { exportFundTable } from "@/lib/fund-reports.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const bdt = (n: number | null | undefined) =>
  "৳ " + Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const usd = (n: number | null | undefined) =>
  "$ " + Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const money2 = (m: { BDT: number; USD: number }) =>
  [m.BDT ? bdt(m.BDT) : null, m.USD ? usd(m.USD) : null].filter(Boolean).join(" · ") || bdt(0);

export type Preset = "this_month" | "last_month" | "this_quarter" | "this_year" | "all" | "custom";
const PRESETS: [Preset, string][] = [
  ["this_month", "This Month"], ["last_month", "Last Month"], ["this_quarter", "This Quarter"],
  ["this_year", "This Year"], ["all", "All Time"], ["custom", "Custom"],
];

/** Dhaka calendar date YYYY-MM-DD */
function dhakaToday() {
  return new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
}
const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

export function presetRange(p: Preset): { from: string | null; to: string | null } {
  const t = dhakaToday();
  const y = +t.slice(0, 4), m = +t.slice(5, 7) - 1;
  if (p === "this_month") return { from: ymd(y, m, 1), to: t };
  if (p === "last_month") return { from: ymd(y, m - 1, 1), to: ymd(y, m, 0) };
  if (p === "this_quarter") return { from: ymd(y, Math.floor(m / 3) * 3, 1), to: t };
  if (p === "this_year") return { from: ymd(y, 0, 1), to: t };
  return { from: null, to: null };
}

export function useDateRange(initial: Preset = "all") {
  const [preset, setPreset] = useState<Preset>(initial);
  const [custom, setCustom] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const range = preset === "custom" ? custom : presetRange(preset);
  return { preset, setPreset, custom, setCustom, range };
}

export function DateRangeBar({ state }: { state: ReturnType<typeof useDateRange> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map(([k, l]) => (
        <button key={k} type="button" onClick={() => state.setPreset(k)}
          className={cn("h-8 rounded-sm border px-2.5 text-[12px]", state.preset === k ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
          {l}
        </button>
      ))}
      {state.preset === "custom" && (
        <>
          <input type="date" className="h-8 rounded-sm border border-border bg-card px-2 text-[12px]" value={state.custom.from ?? ""} onChange={(e) => state.setCustom({ ...state.custom, from: e.target.value || null })} />
          <span className="text-[12px] text-muted-foreground">to</span>
          <input type="date" className="h-8 rounded-sm border border-border bg-card px-2 text-[12px]" value={state.custom.to ?? ""} onChange={(e) => state.setCustom({ ...state.custom, to: e.target.value || null })} />
        </>
      )}
    </div>
  );
}

export function Tile({ label, value, hint, onClick, tone }: { label: string; value: string; hint?: string; onClick?: () => void; tone?: "warn" | "ok" }) {
  const C = onClick ? "button" : "div";
  return (
    <C type={onClick ? "button" : undefined} onClick={onClick}
      className={cn("rounded-md border bg-card p-3 text-left", tone === "warn" ? "border-amber-300" : tone === "ok" ? "border-emerald-300" : "border-border", onClick && "transition hover:border-primary")}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-[15px] font-bold">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </C>
  );
}

export function Section({ title, right, children, id }: { title: string; right?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-[13.5px] font-semibold">{title}</h2>
        {right}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export type Col<T> = { h: string; c: (r: T) => React.ReactNode; right?: boolean; x?: (r: T) => string | number | null; t?: "text" | "number" | "date" };

export function DataTable<T>({ cols, rows, empty = "No records.", foot }: { cols: Col<T>[]; rows: T[]; empty?: string; foot?: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[12.5px]">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            {cols.map((c) => <th key={c.h} className={cn("px-2 py-2 font-semibold", c.right && "text-right")}>{c.h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={cols.length} className="px-2 py-6 text-center text-muted-foreground">{empty}</td></tr>}
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
              {cols.map((c) => <td key={c.h} className={cn("px-2 py-1.5 align-top", c.right && "text-right font-mono")}>{c.c(r)}</td>)}
            </tr>
          ))}
        </tbody>
        {foot}
      </table>
    </div>
  );
}

function download(base64: string, mime: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function ExportButtons<T>({ title, cols, rows, preamble, load }: { title: string; cols: Col<T>[]; rows?: T[]; preamble?: string[]; load?: () => Promise<T[]> }) {
  const run = useServerFn(exportFundTable);
  const [busy, setBusy] = useState<string | null>(null);
  const go = async (format: "csv" | "xlsx") => {
    setBusy(format);
    try {
      const data = load ? await load() : rows ?? [];
      const exp = cols.filter((c) => c.x);
      const res = await run({ data: { title, format, preamble, columns: exp.map((c) => ({ header: c.h, type: c.t ?? (c.right ? "number" : "text") })), rows: data.map((r) => exp.map((c) => { const v = c.x!(r); return v === undefined ? null : v; })) } });
      download(res.base64, res.mime, res.filename);
      toast.success(`${data.length} rows exported`);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <div className="flex gap-1.5">
      {(["csv", "xlsx"] as const).map((f) => (
        <Button key={f} size="sm" variant="outline" className="h-7 rounded-sm text-[11.5px]" disabled={!!busy} onClick={() => void go(f)}>
          {busy === f ? <TestLoader tone="export" className="mr-1 size-3.5" /> : <Download className="mr-1 size-3" />}{f.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}

export function Bars({ items, fmt = bdt }: { items: { label: string; amount: number }[]; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.amount)));
  if (!items.length) return <div className="py-4 text-center text-[12px] text-muted-foreground">No data for this period.</div>;
  return (
    <div className="space-y-1.5">
      {items.map((i) => (
        <div key={i.label} className="text-[12px]">
          <div className="flex justify-between gap-2"><span className="truncate capitalize">{i.label}</span><span className="font-mono">{fmt(i.amount)}</span></div>
          <div className="mt-0.5 h-1.5 rounded-sm bg-muted"><div className="h-1.5 rounded-sm bg-primary" style={{ width: `${(Math.abs(i.amount) / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function Select({ value, onChange, options, placeholder }: { value: string | null; onChange: (v: string | null) => void; options: { id: string; label: string }[]; placeholder: string }) {
  return (
    <select className="h-8 max-w-[200px] rounded-sm border border-border bg-card px-2 text-[12px]" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
export const fmtDay = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric" }) : "—");
