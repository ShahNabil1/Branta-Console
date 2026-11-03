import { useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { updateCompanyPrefixes } from "@/lib/companies.functions";
import { DEFAULT_PREFIX, PREFIX_KINDS, PREFIX_RE, type PrefixKind, type Prefixes } from "@/lib/brand-kit";

type Co = { id: string; name: string; slug: string; is_holding: boolean; tagline?: string | null; code_prefixes?: unknown };

export function CompanySettings({ c, accent }: { c: Co; accent: string }) {
  return <div className="min-w-0 animate-in fade-in slide-in-from-bottom-1 duration-300"><PrefixPanel c={c} accent={accent} /></div>;
}

function Card({ title, sub, children, right }: { title: string; sub?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><h3 className="text-[14px] font-bold">{title}</h3>{sub && <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground">{sub}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

const KIND_LABEL: Record<PrefixKind, { label: string; sample: (p: string) => string; live: boolean }> = {
  lead: { label: "Lead code", sample: (p) => `${p}101`, live: true },
  customer: { label: "Customer code", sample: (p) => `${p}042`, live: true },
  invoice: { label: "Invoice number", sample: (p) => `${p}0001`, live: false },
  expense: { label: "Expense voucher", sample: (p) => `${p}2611-001`, live: false },
};

function PrefixPanel({ c, accent }: { c: Co; accent: string }) {
  const saved = useMemo(() => (c.code_prefixes as Prefixes) ?? {}, [c.code_prefixes]);
  const [p, setP] = useState<Prefixes>(saved);
  const [saving, setSaving] = useState(false);
  const fn = useServerFn(updateCompanyPrefixes);
  const qc = useQueryClient();
  const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v)) as Prefixes;
  const invalid = Object.values(clean).some((v) => !PREFIX_RE.test(v!));
  const dirty = JSON.stringify(clean) !== JSON.stringify(saved);
  const save = async () => {
    setSaving(true);
    try {
      await fn({ data: { id: c.id, prefixes: clean } });
      await qc.invalidateQueries({ queryKey: ["company"] });
      toast.success("Code prefixes saved. New records use them from now on.");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  return (
    <Card title="Code prefixes" sub="Only new records get the new prefix — existing codes never change. Numbers stay one group-wide series."
      right={<div className="flex gap-2"><Button variant="outline" size="sm" disabled={!dirty || saving} onClick={() => setP(saved)}>Cancel</Button>
        <Button size="sm" disabled={!dirty || invalid || saving} onClick={save}>{saving && <Loader2 className="size-3.5 animate-spin" />}Save</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {PREFIX_KINDS.map((kind) => {
          const meta = KIND_LABEL[kind];
          const v = p[kind] ?? "";
          const eff = v || (c.is_holding ? DEFAULT_PREFIX[kind] : "");
          const bad = !!v && !PREFIX_RE.test(v);
          return (
            <div key={kind} className="rounded-lg border border-border p-3 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold">{meta.label}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", meta.live ? "bg-status-converted/10 text-status-converted" : "bg-muted text-muted-foreground")}>
                  {meta.live ? "Active now" : "Applies with Finance phase"}
                </span>
              </div>
              <Input value={v} placeholder={c.is_holding ? DEFAULT_PREFIX[kind] : "e.g. ADL-"} maxLength={6}
                onChange={(e) => { let x = e.target.value.toUpperCase().replace(/[^A-Z-]/g, ""); setP((o) => ({ ...o, [kind]: x })); }}
                onBlur={() => v && !v.endsWith("-") && setP((o) => ({ ...o, [kind]: `${v}-` }))}
                className={cn("mt-2 font-mono", bad && "border-destructive")} />
              <div className="mt-2 flex items-center justify-between text-[11px] font-semibold">
                <span className={bad ? "text-destructive" : "text-muted-foreground"}>{bad ? "2–5 capital letters then -" : eff ? "Next looks like" : "Uses the group default"}</span>
                {eff && !bad && <span className="font-mono font-bold" style={{ color: accent }}>{meta.sample(eff)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
