import { createFileRoute } from "@tanstack/react-router";
import { useActiveCompany } from "@/components/company/company-switcher";
import { PageHero } from "@/components/branta/page-hero";
import { Wallet } from "lucide-react";
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
      <PageHero icon={Wallet} eyebrow={active.name} title="Wallet" subtitle="Fund balances, statement and loan requests — only this company's money." />
      <CompanyWallet key={active.id} companyId={active.id} companyName={active.name} accent="var(--brand)" />
    </div>
  );
}
