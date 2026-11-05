import { createFileRoute } from "@tanstack/react-router";
import { MyWalletPanel } from "@/components/profile/my-wallet-panel";

export const Route = createFileRoute("/_authenticated/app/profile/finance")({
  head: () => ({
    meta: [
      { title: "My Wallet · Profile" },
      { name: "description", content: "Your wallet balance and statement." },
      { property: "og:title", content: "My Wallet · Profile" },
      { property: "og:description", content: "Your wallet balance and statement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceTab,
});

function FinanceTab() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-4 px-3 py-5 sm:px-6 sm:py-8">
      <MyWalletPanel />
    </div>
  );
}
