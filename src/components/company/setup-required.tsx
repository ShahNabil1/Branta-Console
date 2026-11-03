import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { getCompanySetupStatus, type SetupItem } from "@/lib/company-setup.functions";
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
