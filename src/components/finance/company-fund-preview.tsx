import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Settings2 } from "lucide-react";
import { getCustomerFundContext } from "@/lib/company-wallet.functions";
import { splitInstallment } from "@/lib/company-fund-split";

type Ctx = Awaited<ReturnType<typeof getCustomerFundContext>>;

export function useCustomerFundContext(customerId: string | null | undefined) {
  const fn = useServerFn(getCustomerFundContext);
  return useQuery<Ctx>({ queryKey: ["customer-fund-ctx", customerId], queryFn: () => fn({ data: { customerId: customerId! } }), enabled: !!customerId, staleTime: 30_000 });
}

const fmt = (n: number, cur: string) => `${cur === "BDT" ? "৳" : `${cur} `}${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Live split of a sister-company invoice by that company's saved Fund Allocation (same math as the wallet credit). */
export function CompanyFundPreview({ ctx, amount, currency }: { ctx: Extract<Ctx, { sister: true }>; amount: number; currency: string }) {
  const { shares, fixedTotal, net } = splitInstallment(amount, ctx.funds);
  const max = Math.max(1, ...shares.map((s) => s.amount));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-bold"><PieChart className="size-4 text-brand" /> {ctx.company.name} fund allocation</h3>
          <p className="mt-0.5 text-[11.5px] font-semibold text-muted-foreground">
            {ctx.version ? `Version ${ctx.version}. ` : ""}Each paid installment is credited to the {ctx.company.name} wallet with this split.
          </p>
        </div>
        <Link to="/app/companies/$slug" params={{ slug: ctx.company.slug }} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11.5px] font-bold text-muted-foreground transition-colors hover:border-brand/30 hover:text-foreground">
          <Settings2 className="size-3.5" /> Edit split
        </Link>
      </div>
      {!ctx.funds.length ? (
        <p className="rounded-lg border border-dashed border-destructive/40 p-4 text-[12px] font-semibold text-destructive">
          No Fund Allocation saved for {ctx.company.name}. Payments will be recorded, but the wallet can't be credited until one is saved.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {([["Invoice total", amount], ["Fixed off", fixedTotal], ["Shared by %", net]] as const).map(([l, v]) => (
              <div key={l} className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">{l}</div>
                <div className="mt-0.5 truncate font-mono text-[13px] font-bold">{fmt(v, currency)}</div>
              </div>
            ))}
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {ctx.funds.map((f, i) => (
              <li key={f.key} className="rounded-lg border border-border/70 p-2.5 transition-colors hover:border-brand/30">
                <div className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-bold">{f.label}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-px font-mono text-[10px] font-bold text-muted-foreground">{f.mode === "fixed" ? "fixed" : `${f.percent}%`}</span>
                  </span>
                  <span className="shrink-0 font-mono font-bold">{fmt(shares[i].amount, currency)}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-brand/70 transition-all duration-500" style={{ width: `${(shares[i].amount / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
