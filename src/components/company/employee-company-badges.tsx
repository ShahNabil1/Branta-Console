import { CompanyAvatar } from "./company-avatar";
import { companyIdentity } from "@/lib/company-identity";
import { cn } from "@/lib/utils";

export type BadgeCompany = { name: string; slug: string; isHolding: boolean; logoUrl: string | null; mark: string | null };

/** Logo + name chips showing which company (or companies) an employee belongs to. */
export function EmployeeCompanyBadges({ companies, className, size = "sm" }: { companies: BadgeCompany[]; className?: string; size?: "sm" | "md" }) {
  if (!companies?.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {companies.map((c) => {
        const icon = c.mark || companyIdentity(c.slug, { logo_url: c.logoUrl ?? undefined }).icon;
        return (
          <span
            key={c.slug}
            title={c.name}
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/50 pr-2.5 font-semibold text-foreground",
              size === "md" ? "py-1 pl-1 text-[12px]" : "py-0.5 pl-0.5 text-[11px]",
            )}
          >
            <CompanyAvatar name={c.name} slug={c.slug} iconUrl={icon} className={cn("rounded-full text-[9px]", size === "md" ? "size-5" : "size-4")} />
            <span className="truncate">{c.name}</span>
          </span>
        );
      })}
    </div>
  );
}
