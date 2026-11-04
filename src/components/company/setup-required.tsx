import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Plug, XCircle } from "lucide-react";
import { GoogleMark, GmailMark } from "./google-account-card";
import verifiedIcon from "@/assets/company/connection-verified.png.asset.json";
import resendLogo from "@/assets/email/resend-wordmark-black.png.asset.json";
import brevoLogo from "@/assets/email/brevo-wordmark.png.asset.json";
import brantaLogo from "@/assets/branta-icon.svg.asset.json";
import noConnectionIcon from "@/assets/company/no-connection.png.asset.json";
import { getCompanySetupStatus, type IntegrationItem, type SetupItem } from "@/lib/company-setup.functions";
import { useActiveCompany } from "./company-switcher";

const LABEL: Record<SetupItem, string> = {
  lead: "Lead Code prefix", customer: "Customer Code prefix", invoice: "Invoice Number prefix",
  expense: "Expense Voucher prefix", fund_allocation: "Fund Allocation",
};
/** What each action needs before it is allowed. */
export const NEEDS: Record<"lead" | "customer" | "invoice" | "expense", SetupItem[]> = {
  lead: ["lead"], customer: ["customer"], invoice: ["invoice", "fund_allocation"], expense: ["expense", "fund_allocation"],
};

export function useCompanySetup() {
  const { active } = useActiveCompany();
  const fn = useServerFn(getCompanySetupStatus);
  const slug = active && !active.is_holding ? active.slug : null;
  const q = useQuery({ queryKey: ["company-setup", slug], queryFn: () => fn({ data: { slug: slug! } }), enabled: !!slug, staleTime: 30_000 });
  const missing = q.data?.missing ?? [];
  return {
    companyName: active?.name ?? "",
    blocked: (action: keyof typeof NEEDS) => NEEDS[action].filter((k) => missing.includes(k)),
  };
}

/** Inline notice shown in place of a create button while setup is incomplete. */
export function SetupRequired({ action }: { action: keyof typeof NEEDS }) {
  const { blocked, companyName } = useCompanySetup();
  const items = blocked(action);
  if (!items.length) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px] font-medium text-muted-foreground">
      <Lock className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {companyName} can't create this yet. A Branta Tech admin must set: <b className="text-foreground">{items.map((i) => LABEL[i]).join(", ")}</b>.
      </span>
    </div>
  );
}

const INT_LABEL: Record<IntegrationItem, string> = {
  google: "Gmail & Calendar (Google account)",
  inbox_address: "Verified in-app Gmail address",
  email_provider: "Resend or Brevo sender",
};
/** What each integration-backed feature needs. Zero fallback: no other company's account is ever used. */
export const INT_NEEDS = {
  inbox: ["google", "inbox_address", "email_provider"],
  meeting: ["google"],
  email: ["email_provider"],
} satisfies Record<string, IntegrationItem[]>;

export function useIntegrationGate(feature: keyof typeof INT_NEEDS) {
  const { active } = useActiveCompany();
  const fn = useServerFn(getCompanySetupStatus);
  const slug = active && !active.is_holding ? active.slug : null;
  const q = useQuery({ queryKey: ["company-setup", slug], queryFn: () => fn({ data: { slug: slug! } }), enabled: !!slug, staleTime: 30_000 });
  const have = q.data?.integrations ?? [];
  const items = slug ? (INT_NEEDS[feature] as IntegrationItem[]).filter((k) => have.includes(k)) : [];
  return { items, loading: !!slug && q.isLoading, companyName: active?.name ?? "" };
}

/** Notice shown instead of an integration-backed feature until the company connects its own accounts. */
export function IntegrationRequired({ feature, compact }: { feature: keyof typeof INT_NEEDS; compact?: boolean }) {
  const { items, companyName } = useIntegrationGate(feature);
  if (!items.length) return null;
  if (compact)
    return (
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px] font-medium text-muted-foreground">
        <Plug className="mt-0.5 size-3.5 shrink-0" />
        <span>Unavailable for {companyName} until connected: <b className="text-foreground">{items.map((i) => INT_LABEL[i]).join(", ")}</b>.</span>
      </div>
    );
  const ROWS: Record<IntegrationItem, { title: string; hint: string; icons: React.ReactNode }> = {
    google: { title: "Connect your company's Google account", hint: "Gmail & Calendar", icons: <GoogleMark className="size-5" /> },
    inbox_address: { title: "In-app Gmail address", hint: "Verify the company Inbox address", icons: <GmailMark className="size-5" /> },
    email_provider: { title: "Resend or Brevo", hint: "Connect at least one sender", icons: <><img src={resendLogo.url} alt="Resend" className="h-3.5" /><span className="text-[11px] font-bold text-muted-foreground">or</span><img src={brevoLogo.url} alt="Brevo" className="h-3.5" /></> },
  };
  return (
    <div className="grid min-h-[calc(100vh-8rem)] place-items-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8 animate-in fade-in zoom-in-95">
        <div className="flex flex-col items-center text-center">
          <img src={noConnectionIcon.url} alt="" className="size-14 shrink-0" />
          <h2 className="mt-4 text-[18px] font-bold tracking-tight text-foreground">No connection</h2>
          <p className="mt-1 whitespace-nowrap text-[13px] font-medium text-muted-foreground">
            {companyName}'s Inbox opens here as soon as every step below is done.
          </p>
        </div>
        <ul className="mt-6 space-y-2">
          {(INT_NEEDS[feature] as IntegrationItem[]).map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
              {items.includes(i) ? <XCircle className="size-4 shrink-0 text-destructive" /> : <img src={verifiedIcon.url} alt="Verified" title="Verified" className="size-4 shrink-0 object-contain" />}
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-foreground">{ROWS[i].title}</div>
                <div className="text-[11.5px] font-medium text-muted-foreground">{ROWS[i].hint}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">{ROWS[i].icons}</div>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5">
          <img src={brantaLogo.url} alt="Branta Tech" className="h-6 shrink-0" />
          <p className="text-[12px] font-medium text-muted-foreground">A Branta Tech admin connects these in <b className="text-foreground">Companies → {companyName} → Integrations</b>.</p>
        </div>
      </div>
    </div>
  );
}
