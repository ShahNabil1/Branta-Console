import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Plug } from "lucide-react";
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
  return (
    <div className="mx-auto mt-16 max-w-md rounded-md border border-border bg-card p-6 text-center">
      <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-muted"><Plug className="size-5 text-muted-foreground" /></div>
      <h2 className="text-[15px] font-semibold text-foreground">Connect {companyName}'s accounts first</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">This feature only uses {companyName}'s own accounts — never another company's. A Branta Tech admin must connect:</p>
      <ul className="mt-3 space-y-1 text-left text-[13px] font-medium text-foreground">
        {items.map((i) => <li key={i} className="flex items-center gap-2"><Lock className="size-3.5 text-muted-foreground" />{INT_LABEL[i]}</li>)}
      </ul>
      <p className="mt-3 text-[12px] text-muted-foreground">Company profile → Integrations</p>
    </div>
  );
}
