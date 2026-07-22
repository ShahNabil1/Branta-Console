import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/profile/wallet")({
  component: WalletRedirect,
});

function WalletRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    toast.info("My Wallet সরানো হয়েছে", {
      description: "এখন থেকে Finance & Payment ট্যাবে পাওয়া যাবে।",
    });
    navigate({ to: "/app/profile/finance", replace: true });
  }, [navigate]);

  return (
    <div className="p-6 text-sm text-muted-foreground">
      Redirecting to Finance & Payment…
    </div>
  );
}
