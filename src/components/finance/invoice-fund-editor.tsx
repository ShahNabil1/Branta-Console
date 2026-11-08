import { useState } from "react";
import { PieChart, Plus, RotateCcw, Trash2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { percentTotal, splitInstallment } from "@/lib/company-fund-split";

export type FundRuleDraft = { uid: string; key?: string; fund_id?: string | null; label: string; mode: "percent" | "fixed"; percent: number; fixed_amount: number };
type DefaultFund = { key: string; fund_id?: string | null; label: string; mode: "percent" | "fixed"; percent: number; fixed_amount: number };

let seq = 0;
const uid = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

export const fromDefaults = (funds: DefaultFund[]): FundRuleDraft[] => funds.map((f) => ({ ...f, uid: uid() }));

export function fundRuleIssues(rules: FundRuleDraft[]): string[] {
  if (!rules.length) return [];
  const out: string[] = [];
  const pct = percentTotal(rules);
  if (pct !== 100) out.push(`Fund allocation percentages must total 100% (now ${pct}%)`);
  if (rules.some((r) => !r.label.trim())) out.push("Every fund allocation needs a name");
  const n = rules.map((r) => r.label.trim().toLowerCase());
  if (n.some((x, i) => x && n.indexOf(x) !== i)) out.push("Fund allocation names must be unique");
  return out;
}

export const toFundRulePayload = (rules: FundRuleDraft[]) =>
  rules.map((r) => ({ key: r.key, fund_id: r.fund_id ?? null, label: r.label.trim(), mode: r.mode, percent: r.mode === "percent" ? Number(r.percent) || 0 : 0, fixed_amount: r.mode === "fixed" ? Number(r.fixed_amount) || 0 : 0 }));

const money = (n: number, cur: string) => `${cur === "BDT" ? "৳" : `${cur} `}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Per-invoice fund split: starts from the company default template and can be tuned for this invoice only. */
export function InvoiceFundEditor({ companyName, defaults, percentOnly, rules, onChange, amount, currency }: {
  companyName: string; defaults: DefaultFund[]; percentOnly: boolean; rules: FundRuleDraft[];
  onChange: (r: FundRuleDraft[]) => void; amount: number; currency: string;
}) {
  const [flash, setFlash] = useState<string | null>(null);
  const { shares, fixedTotal, net } = splitInstallment(amount, rules);
  const total = percentTotal(rules);
  const custom = JSON.stringify(toFundRulePayload(rules).map(({ key: _k, ...r }) => r)) !== JSON.stringify(toFundRulePayload(fromDefaults(defaults)).map(({ key: _k, ...r }) => r));
  const set = (id: string, p: Partial<FundRuleDraft>) => onChange(rules.map((r) => (r.uid === id ? { ...r, ...p } : r)));
  const add = () => { const r = { uid: uid(), label: "", mode: "percent" as const, percent: 0, fixed_amount: 0 }; setFlash(r.uid); onChange([...rules, r]); };
  const max = Math.max(1, ...shares.map((s) => s.amount));
  const tone = total === 100 ? "text-status-converted" : total > 100 ? "text-destructive" : "text-brand";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-[13px] font-bold"><PieChart className="size-4 text-brand" /> Fund allocation</h3>
          <p className="mt-0.5 text-[11.5px] font-semibold text-muted-foreground">
            Starts from {companyName}'s default. Changes here apply to this invoice only.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {custom && (
            <span className="inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10.5px] font-bold text-brand animate-in fade-in zoom-in-95"><Sparkles className="size-3" /> Custom</span>
          )}
          <Button type="button" variant="outline" size="sm" disabled={!custom} onClick={() => onChange(fromDefaults(defaults))}
            className="h-7 gap-1 rounded-lg text-[11.5px] font-bold active:scale-95"><RotateCcw className="size-3" /> Reset</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {([["Net distributable", amount], ["Fixed off", fixedTotal], ["Shared by %", net]] as const).map(([l, v]) => (
          <div key={l} className="min-w-0 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2">
            <div className="truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{l}</div>
            <div className="mt-0.5 truncate font-mono text-[12.5px] font-bold">{money(v, currency)}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-[11px] font-bold">
          <span className="text-muted-foreground">Percentage total</span>
          <span className={cn("font-mono", tone)}>{total}% / 100%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-all duration-500", total === 100 ? "bg-status-converted" : total > 100 ? "bg-destructive" : "bg-brand")} style={{ width: `${Math.min(total, 100)}%` }} />
        </div>
      </div>

      {!rules.length ? (
        <p className="rounded-lg border border-dashed border-border p-5 text-center text-[12px] font-semibold text-muted-foreground">
          No default fund allocation saved for {companyName}. Add funds below for this invoice.
        </p>
      ) : (
        <ul className="space-y-2">
          {rules.map((r, i) => {
            const share = shares[i]?.amount ?? 0;
            const zero = r.mode === "percent" ? !r.percent : !r.fixed_amount;
            return (
              <li key={r.uid} className={cn("group rounded-xl border bg-background p-2.5 transition-all hover:border-brand/30 hover:shadow-sm",
                flash === r.uid ? "border-brand/50 ring-2 ring-brand/10 animate-in fade-in slide-in-from-bottom-1" : "border-border/70", zero && "opacity-70")}>
                <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                  <Input value={r.label} onChange={(e) => set(r.uid, { label: e.target.value })} placeholder="Fund name, e.g. Marketing"
                    maxLength={60} autoComplete="off" className="h-9 min-w-0 flex-1 basis-[calc(100%-2.75rem)] rounded-lg text-[13px] font-semibold sm:basis-auto" />
                  {!percentOnly && (
                    <div role="radiogroup" aria-label="Amount type" className="inline-flex h-9 shrink-0 rounded-lg border border-border bg-muted p-0.5 font-mono text-[13px] font-extrabold">
                      {(["percent", "fixed"] as const).map((m) => (
                        <button key={m} type="button" role="radio" aria-checked={r.mode === m} onClick={() => set(r.uid, { mode: m })}
                          className={cn("w-9 rounded-md transition-all active:scale-95", r.mode === m ? "bg-card text-brand shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                          {m === "percent" ? "%" : "৳"}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="relative min-w-0 flex-1 sm:w-28 sm:flex-none">
                    {r.mode === "fixed" && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-muted-foreground">৳</span>}
                    <Input type="number" inputMode="decimal" min={0} max={r.mode === "percent" ? 100 : undefined} step={r.mode === "percent" ? "0.5" : "1"}
                      value={r.mode === "percent" ? r.percent : r.fixed_amount}
                      onChange={(e) => set(r.uid, r.mode === "percent" ? { percent: Number(e.target.value) } : { fixed_amount: Number(e.target.value) })}
                      className={cn("h-9 rounded-lg text-right font-mono text-[13px] font-semibold", r.mode === "percent" ? "pr-6" : "pl-6")} />
                    {r.mode === "percent" && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] font-bold text-muted-foreground">%</span>}
                  </div>
                  <button type="button" aria-label={`Remove ${r.label || "fund"}`} onClick={() => onChange(rules.filter((x) => x.uid !== r.uid))}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-brand/70 transition-all duration-500" style={{ width: `${(share / max) * 100}%` }} />
                  </div>
                  <span className="shrink-0 font-mono text-[12px] font-bold">{money(share, currency)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Button type="button" variant="outline" size="sm" onClick={add}
        className="h-8 w-full gap-1 rounded-lg border-dashed text-[12px] font-bold hover:border-brand/50 hover:text-brand active:scale-[0.99]">
        <Plus className="size-3.5" /> Add allocation
      </Button>
    </div>
  );
}
