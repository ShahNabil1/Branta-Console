import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getFundSettings, saveAllocationVersion, saveDeductionRule, saveFund } from "@/lib/fund-ledger.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/finance/fund-settings")({
  head: () => ({
    meta: [
      { title: "Fund Settings · Branta Finance" },
      { name: "description", content: "Configure funds, versioned allocation percentages and direct deduction rules." },
      { property: "og:title", content: "Fund Settings · Branta Finance" },
      { property: "og:description", content: "Versioned fund allocation settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FundSettingsPage,
});

function FundSettingsPage() {
  const fetchS = useServerFn(getFundSettings);
  const saveV = useServerFn(saveAllocationVersion);
  const saveF = useServerFn(saveFund);
  const saveR = useServerFn(saveDeductionRule);
  const q = useQuery({ queryKey: ["fund-settings"], queryFn: () => fetchS() });
  const d = q.data as any;

  const [pct, setPct] = useState<Record<string, string>>({});
  const [vName, setVName] = useState("");
  const [vFrom, setVFrom] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!d?.allowed) return;
    const cur = d.versions[0]?.fund_allocation_version_items ?? [];
    setPct(Object.fromEntries(d.funds.map((f: any) => [f.id, String(cur.find((i: any) => i.fund_id === f.id)?.percent ?? 0)])));
  }, [d]);
  const activeFunds = (d?.funds ?? []).filter((f: any) => f.is_active);
  const total = useMemo(() => Math.round(activeFunds.reduce((a: number, f: any) => a + (Number(pct[f.id]) || 0), 0) * 1000) / 1000, [pct, activeFunds]);

  const mV = useMutation({
    mutationFn: () => saveV({ data: { name: vName, effective_from: vFrom, reason, items: activeFunds.map((f: any) => ({ fund_id: f.id, percent: Number(pct[f.id]) || 0 })) } }),
    onSuccess: () => { toast.success("New allocation version saved"); setVName(""); setReason(""); void q.refetch(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const mF = useMutation({ mutationFn: (p: any) => saveF({ data: p }), onSuccess: () => void q.refetch(), onError: (e) => toast.error((e as Error).message) });
  const mR = useMutation({ mutationFn: (p: any) => saveR({ data: p }), onSuccess: () => void q.refetch(), onError: (e) => toast.error((e as Error).message) });

  const [newFund, setNewFund] = useState("");
  const [rule, setRule] = useState({ name: "", amount_type: "percent", value: "" });

  if (q.isLoading) return <div className="p-6"><div className="h-64 animate-pulse rounded-md bg-muted" /></div>;
  if (!d?.allowed) return <div className="p-10 text-center text-[13px] text-muted-foreground">Finance access required.</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <h1 className="text-[20px] font-bold">Fund Settings</h1>

      <section className="rounded-md border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-[14px] font-semibold">Funds & future allocation</h2>
          <p className="text-[12px] text-muted-foreground">Saving creates a new version. Past allocations keep their original percentages forever.</p>
        </header>
        <div className="divide-y divide-border">
          {d.funds.map((f: any) => (
            <div key={f.id} className="grid grid-cols-12 items-center gap-2 px-4 py-2">
              <Input className="col-span-12 h-8 sm:col-span-5" defaultValue={f.name} onBlur={(e) => e.target.value !== f.name && mF.mutate({ id: f.id, name: e.target.value, description: f.description, is_active: f.is_active, display_order: f.display_order })} />
              <Input type="number" className="col-span-3 h-8 sm:col-span-2" defaultValue={f.display_order} onBlur={(e) => Number(e.target.value) !== f.display_order && mF.mutate({ id: f.id, name: f.name, description: f.description, is_active: f.is_active, display_order: Number(e.target.value) })} title="Order" />
              <div className="col-span-5 flex items-center gap-1 sm:col-span-3">
                <Input type="number" step="0.5" disabled={!f.is_active} className="h-8 font-mono" value={pct[f.id] ?? ""} onChange={(e) => setPct({ ...pct, [f.id]: e.target.value })} />
                <span className="text-[12px]">%</span>
              </div>
              <Button size="sm" variant="outline" className="col-span-4 h-8 sm:col-span-2" onClick={() => mF.mutate({ id: f.id, name: f.name, description: f.description, is_active: !f.is_active, display_order: f.display_order })}>
                {f.is_active ? "Deactivate" : "Activate"}
              </Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <Input className="h-8 w-56" placeholder="New custom fund name" value={newFund} onChange={(e) => setNewFund(e.target.value)} />
          <Button size="sm" variant="outline" disabled={newFund.length < 2} onClick={() => { mF.mutate({ name: newFund, is_active: true, display_order: d.funds.length + 1 }); setNewFund(""); }}>Create fund</Button>
        </div>
        <div className="space-y-2 border-t border-border bg-muted/30 px-4 py-3">
          <div className={cn("text-[13px] font-bold", total === 100 ? "text-emerald-700" : "text-destructive")}>Current total: {total}%</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Input className="h-8" placeholder="Version name (e.g. October 2026)" value={vName} onChange={(e) => setVName(e.target.value)} />
            <Input className="h-8" type="date" value={vFrom} onChange={(e) => setVFrom(e.target.value)} />
            <Input className="h-8" placeholder="Reason (min 5 chars)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button disabled={total !== 100 || vName.length < 2 || reason.length < 5 || mV.isPending} onClick={() => mV.mutate()}>Save new allocation version</Button>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-[14px] font-semibold">Default direct deduction rules</h2>
          <p className="text-[12px] text-muted-foreground">Applied to every paid installment before fund allocation (e.g. gateway fee).</p>
        </header>
        <div className="divide-y divide-border">
          {d.rules.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-2 text-[13px]">
              <span>{r.name} · <span className="font-mono">{r.amount_type === "percent" ? `${r.value}%` : `৳ ${r.value}`}</span></span>
              <Button size="sm" variant="ghost" onClick={() => mR.mutate({ id: r.id, name: r.name, amount_type: r.amount_type, value: Number(r.value), is_active: !r.is_active })}>{r.is_active ? "Disable" : "Enable"}</Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          <Input className="h-8 w-48" placeholder="Rule name" value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} />
          <select className="h-8 rounded-sm border border-input bg-background px-2 text-[13px]" value={rule.amount_type} onChange={(e) => setRule({ ...rule, amount_type: e.target.value })}>
            <option value="percent">Percent</option><option value="fixed">Fixed ৳</option>
          </select>
          <Input className="h-8 w-28" type="number" placeholder="Value" value={rule.value} onChange={(e) => setRule({ ...rule, value: e.target.value })} />
          <Button size="sm" disabled={rule.name.length < 2 || !rule.value} onClick={() => { mR.mutate({ name: rule.name, amount_type: rule.amount_type, value: Number(rule.value), is_active: true }); setRule({ name: "", amount_type: "percent", value: "" }); }}>Add rule</Button>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="mb-2 text-[14px] font-semibold">Version history</h2>
        <div className="space-y-1 text-[12.5px]">
          {d.versions.map((v: any) => (
            <div key={v.id} className="flex justify-between"><span className="font-semibold">{v.name}</span><span className="text-muted-foreground">from {v.effective_from}</span></div>
          ))}
        </div>
      </section>
    </div>
  );
}
