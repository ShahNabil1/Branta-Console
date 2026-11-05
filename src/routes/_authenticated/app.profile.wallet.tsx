import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/profile/wallet")({
  component: WalletRedirect,
});

function WalletRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    toast.info("My Wallet নতুন জায়গায়", {
      description: "এখন থেকে Profile → My Wallet ট্যাবে পাওয়া যাবে।",
    });
    navigate({ to: "/app/profile/finance", replace: true });
  }, [navigate]);

  return (
    <div className="p-6 text-sm text-muted-foreground">
      Redirecting to My Wallet…
    </div>
  );
}
