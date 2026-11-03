import { createFileRoute } from "@tanstack/react-router";
import { MyWalletPanel } from "@/components/profile/my-wallet-panel";
import { PaymentMethodsSection } from "@/components/profile/payment-methods-section";

export const Route = createFileRoute("/_authenticated/app/profile/finance")({
  head: () => ({ meta: [{ title: "Finance & Wallet · Profile" }] }),
  component: FinanceTab,
});

function FinanceTab() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4 px-3 py-5 sm:px-6 sm:py-8">
      <MyWalletPanel />
      <PaymentMethodsSection />
    </div>
  );
}
