import { createFileRoute } from "@tanstack/react-router";
import { useActiveCompany } from "@/components/company/company-switcher";
import { CompanyWallet } from "@/components/company/company-wallet";

export const Route = createFileRoute("/_authenticated/app/org/$org/finance/wallet")({
  head: () => ({ meta: [{ title: "Wallet · Finance · Company" }, { name: "robots", content: "noindex" }] }),
  component: OrgWalletPage,
});

/** The company's own wallet: fund balances, statement and loan requests. */
function OrgWalletPage() {
  const { active } = useActiveCompany();
  if (!active) return null;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-[20px] font-bold tracking-tight">Wallet</h1>
        <p className="mt-0.5 text-[12.5px] font-medium text-muted-foreground">{active.name} · fund balances, statement and loan requests.</p>
      </div>
      <CompanyWallet key={active.id} companyId={active.id} companyName={active.name} accent="var(--brand)" />
    </div>
  );
}
