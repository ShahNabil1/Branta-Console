import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getWalletStatement, type WalletTxn } from "@/lib/wallet-statement.functions";
import { cn } from "@/lib/utils";

export const money = (n: number, c = "BDT") =>
  `${c === "BDT" ? "৳" : "$"} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type Period = "today" | "week" | "month" | "last_month" | "custom" | "all";
export const PERIODS: [Period, string][] = [["today", "Today"], ["week", "This Week"], ["month", "This Month"], ["last_month", "Last Month"], ["custom", "Custom"], ["all", "All Time"]];

/** Dhaka calendar day (YYYY-MM-DD). */
export const dhakaDay = (d: string | Date) => new Date(new Date(d).getTime() + 6 * 3600_000).toISOString().slice(0, 10);

export function periodRange(p: Period, from?: string, to?: string): [string, string] | null {
  const today = dhakaDay(new Date());
  const t = new Date(`${today}T00:00:00Z`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (p === "today") return [today, today];
  if (p === "week") { const s = new Date(t); s.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 1) % 7)); return [iso(s), today]; } // week starts Saturday
  if (p === "month") return [`${today.slice(0, 7)}-01`, today];
  if (p === "last_month") { const s = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1)); const e = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0)); return [iso(s), iso(e)]; }
  if (p === "custom" && from && to) return [from, to];
  return null;
}
export const inRange = (d: string, r: [string, string] | null) => { if (!r) return true; const k = dhakaDay(d); return k >= r[0] && k <= r[1]; };

export type WalletSummary = { available: number; pending: number; totalEarned: number; withdrawn: number; today: number; week: number; month: number };
export function summarize(rows: WalletTxn[]): WalletSummary {
  const earned = (r: [string, string] | null) => rows.filter((x) => x.credit > 0 && inRange(x.occurred_at, r)).reduce((a, x) => a + x.credit, 0);
  return {
    available: rows.reduce((a, x) => a + x.credit - x.debit, 0),
    pending: rows.reduce((a, x) => a + x.pending, 0),
    totalEarned: earned(null),
    withdrawn: rows.filter((x) => x.debit > 0 && x.status === "Paid").reduce((a, x) => a + x.debit, 0),
    today: earned(periodRange("today")), week: earned(periodRange("week")), month: earned(periodRange("month")),
  };
}

export function PeriodFilter({ p, setP, from, to, setFrom, setTo }: { p: Period; setP: (p: Period) => void; from: string; to: string; setFrom: (s: string) => void; setTo: (s: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {PERIODS.map(([k, l]) => (
        <button key={k} onClick={() => setP(k)} className={cn("h-7 rounded-sm border px-2 text-[11.5px]", p === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>{l}</button>
      ))}
      {p === "custom" && (
        <>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 rounded-sm border border-input bg-background px-1.5 text-[11.5px]" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 rounded-sm border border-input bg-background px-1.5 text-[11.5px]" />
        </>
      )}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "brand" | "muted" }) {
  return (
    <div className="rounded-sm border border-border bg-card p-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono text-[15px] font-semibold", tone === "brand" && "text-primary", tone === "muted" && "text-muted-foreground")}>{value}</div>
    </div>
  );
}

/** Bank-style Wallet & Earnings statement. Omit userId for the signed-in user. */
export function WalletStatement({ userId, rows: given }: { userId?: string; rows?: WalletTxn[] }) {
  const fn = useServerFn(getWalletStatement);
  const q = useQuery({ queryKey: ["wallet-statement", userId ?? "me"], queryFn: () => fn({ data: { userId } }), enabled: !given, staleTime: 15_000 });
  const rows = given ?? q.data ?? [];
  const [p, setP] = useState<Period>("all");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [type, setType] = useState("all");
  const [open, setOpen] = useState<WalletTxn | null>(null);
  const s = useMemo(() => summarize(rows), [rows]);
  const range = periodRange(p, from, to);
  const shown = rows.filter((r) => inRange(r.occurred_at, range) && (type === "all" || r.txn_type === type)).slice().reverse();
  const types = Array.from(new Set(rows.map((r) => r.txn_type)));
  const periodEarned = shown.reduce((a, r) => a + r.credit, 0);

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Available balance" value={money(s.available)} tone="brand" />
        <Stat label="Pending / Committed" value={money(s.pending)} tone="muted" />
        <Stat label="Today earned" value={money(s.today)} />
        <Stat label="This week" value={money(s.week)} />
        <Stat label="This month" value={money(s.month)} />
        <Stat label="Total earned" value={money(s.totalEarned)} />
        <Stat label="Total withdrawn" value={money(s.withdrawn)} />
        <Stat label="Selected period" value={money(periodEarned)} />
      </div>

      <div className="rounded-sm border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h3 className="text-[13px] font-semibold">Wallet statement</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select value={type} onChange={(e) => setType(e.target.value)} className="h-7 rounded-sm border border-input bg-background px-1.5 text-[11.5px]">
              <option value="all">All types</option>{types.map((t) => <option key={t}>{t}</option>)}
            </select>
            <PeriodFilter p={p} setP={setP} from={from} to={to} setFrom={setFrom} setTo={setTo} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[12px]">
            <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <tr>{["Date", "Description", "Client / Project", "Invoice", "Task", "Type", "Credit", "Debit", "Balance", "Status", "Reference"].map((h) => <th key={h} className={cn("px-2.5 py-2", ["Credit", "Debit", "Balance"].includes(h) && "text-right")}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {q.isLoading && !given ? <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
                : shown.length === 0 ? <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">No transactions in this period.</td></tr>
                : shown.map((r) => (
                  <tr key={r.txn_id} onClick={() => setOpen(r)} className="cursor-pointer hover:bg-muted/40">
                    <td className="whitespace-nowrap px-2.5 py-2 text-muted-foreground">{new Date(r.occurred_at).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}</td>
                    <td className="px-2.5 py-2"><div className="font-medium">{r.description}</div><div className="text-[10.5px] text-muted-foreground">{r.source}</div></td>
                    <td className="px-2.5 py-2">{r.client ?? "—"}{r.project ? <div className="text-[10.5px] text-muted-foreground">{r.project}</div> : null}</td>
                    <td className="px-2.5 py-2 font-mono">{r.invoice_slug ?? "—"}{r.installment ? <div className="font-sans text-[10.5px] text-muted-foreground">{r.installment}</div> : null}</td>
                    <td className="px-2.5 py-2">{r.task ?? "—"}</td>
                    <td className="px-2.5 py-2">{r.txn_type}</td>
                    <td className="px-2.5 py-2 text-right font-mono text-emerald-700">{r.credit ? money(r.credit, r.currency) : r.pending ? <span className="text-muted-foreground">({money(r.pending, r.currency)})</span> : ""}</td>
                    <td className="px-2.5 py-2 text-right font-mono text-destructive">{r.debit ? money(r.debit, r.currency) : ""}</td>
                    <td className="px-2.5 py-2 text-right font-mono font-semibold">{money(r.balance, r.currency)}</td>
                    <td className="px-2.5 py-2"><span className="rounded-sm border border-border px-1.5 py-0.5 text-[10.5px]">{r.status}</span></td>
                    <td className="px-2.5 py-2 font-mono text-[11px] text-muted-foreground">{r.reference}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">Amounts in brackets are pending/committed — they are not in the balance yet. Planned or draft payments never appear here.</p>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4" onClick={() => setOpen(null)}>
          <div className="w-full max-w-md rounded-md border border-border bg-card p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[14px] font-semibold">{open.description}</h3>
            <dl className="mt-3 grid grid-cols-[130px_1fr] gap-y-1.5 text-[12px]">
              {([
                ["Date", new Date(open.occurred_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })], ["Type", open.txn_type], ["Source", open.source],
                ["Client", open.client], ["Project", open.project], ["Invoice", open.invoice_slug], ["Installment", open.installment], ["Task", open.task],
                ["Credit", open.credit ? money(open.credit, open.currency) : null], ["Debit", open.debit ? money(open.debit, open.currency) : null],
                ["Pending", open.pending ? money(open.pending, open.currency) : null], ["Balance after", money(open.balance, open.currency)],
                ["Status", open.status], ["Reference", open.reference], ["Transaction ID", open.txn_id],
              ] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
                <><dt key={`${k}k`} className="text-muted-foreground">{k}</dt><dd key={`${k}v`} className="font-medium break-all">{v}</dd></>
              ))}
            </dl>
            <div className="mt-4 flex justify-end gap-2">
              {open.invoice_slug && <Link to="/app/finance/invoices/$slug" params={{ slug: open.invoice_slug }} className="inline-flex h-8 items-center rounded-sm border border-border px-3 text-[12px] hover:bg-muted">Open invoice</Link>}
              <button onClick={() => setOpen(null)} className="h-8 rounded-sm bg-primary px-3 text-[12px] text-primary-foreground">Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
