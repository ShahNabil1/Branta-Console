import { WalletLedgerView } from "@/components/finance/wallet-ledger-view";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { listMySalarySlips, getSignedSalarySlipUrl, getSalarySealedFileUrl } from "@/lib/salary.functions";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";

function fmt(n: number | null | undefined, cur: string) {
  const sym = cur === "BDT" ? "৳ " : "$ ";
  return sym + Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function MyWalletPanel() {
  return (
    <div className="space-y-4">
      <h2 className="text-[13px] font-semibold text-foreground flex items-center gap-2"><Wallet className="size-4 text-brand" /> My Wallet</h2>
      <WalletLedgerView own />
      <MySalarySlips />
    </div>
  );
}

function MySalarySlips() {
  const listFn = useServerFn(listMySalarySlips);
  const urlFn = useServerFn(getSignedSalarySlipUrl);
  const sealedFn = useServerFn(getSalarySealedFileUrl);
  const q = useQuery({ queryKey: ["my-salary-slips"], queryFn: () => listFn(), staleTime: 30_000 });

  const open = async (id: string) => {
    try {
      const r = await urlFn({ data: { id } });
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const openSealed = async (id: string, download?: boolean) => {
    try {
      const r = await sealedFn({ data: { id, ...(download ? { download: true } : {}) } });
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!q.data || q.data.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Salary slips
      </div>
      <div className="divide-y divide-border">
        {q.data.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <div>
              <div className="text-[13px] font-medium">
                {new Date(`${String(s.period_month).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
                {s.status === "void" && <span className="ml-2 text-[11px] text-destructive">Void</span>}
              </div>
              <div className="font-mono text-[11.5px] text-muted-foreground">{s.slip_no ?? "—"}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[13px] font-semibold">{fmt(s.net_amount, s.currency)}</span>
              <Button variant="outline" className="h-8 rounded-sm text-[12px]" onClick={() => open(s.id)}>
                View slip
              </Button>
              {s.signed_slip_url && (
                <>
                  <Button variant="outline" className="h-8 rounded-sm text-[12px]" onClick={() => openSealed(s.id)}>
                    Signed copy
                  </Button>
                  <Button variant="ghost" className="h-8 rounded-sm text-[12px]" onClick={() => openSealed(s.id, true)}>
                    Download
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
