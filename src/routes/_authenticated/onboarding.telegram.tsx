// Forced Telegram link — first sign-in after admin creates the employee.
// Reuses the standard TelegramConnectCard for the actual linking flow; this
// route just gates and advances to /app the moment the subscription is active.
import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { BRAND_LOGO as brandLogo } from "@/lib/brand-assets";
import { TelegramConnectCard } from "@/components/profile/telegram-connect-card";
import { TelegramIcon } from "@/components/social/telegram-icon";
import { getOnboardingStatus } from "@/lib/onboarding.functions";
import { getMyTelegramStatus } from "@/lib/telegram.functions";

export const Route = createFileRoute("/_authenticated/onboarding/telegram")({
  ssr: false,
  head: () => ({ meta: [{ title: "Link Telegram · Branta Tech" }] }),
  component: OnboardingTelegramPage,
});

function OnboardingTelegramPage() {
  const navigate = useNavigate();
  const statusFn = useServerFn(getOnboardingStatus);
  const tgFn = useServerFn(getMyTelegramStatus);

  const status = useQuery({
    queryKey: ["onboarding.status"],
    queryFn: () => statusFn(),
  });

  // Poll telegram status directly so we advance the moment the user finishes
  // linking in the Telegram app (the TelegramConnectCard triggers a link, but
  // its own polling only refreshes its own query key).
  const tg = useQuery({
    queryKey: ["telegram-status"],
    queryFn: () => tgFn(),
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (!status.data) return;
    // Password step not done → back to password.
    if (status.data.mustChangePassword) {
      navigate({ to: "/onboarding/password", replace: true });
      return;
    }
    // Either the flag has been cleared (self-heal on server) or telegram is
    // freshly linked — both mean we're done.
    if (!status.data.mustLinkTelegram || tg.data?.linked) {
      navigate({ to: "/app", replace: true });
    }
  }, [status.data, tg.data, navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-muted/40 p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="rounded-md border border-border bg-card p-6 text-center shadow-sm">
          <img
            src={brandLogo.url}
            alt="Branta Tech"
            className="mx-auto mb-3 h-9 w-auto"
          />
          <div className="mx-auto grid size-10 place-items-center rounded-full bg-sky-100 text-sky-600">
            <TelegramIcon className="size-5" />
          </div>
          <h1 className="mt-3 text-[15px] font-semibold">
            Connect Telegram to continue
          </h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Branta Tech sends real-time alerts (mentions, invoices, security
            events) to Telegram. Linking your account is a required one-time
            setup for every employee.
          </p>
        </div>

        <TelegramConnectCard />

        {status.isLoading && (
          <div className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Checking status…
          </div>
        )}
      </div>
    </div>
  );
}
