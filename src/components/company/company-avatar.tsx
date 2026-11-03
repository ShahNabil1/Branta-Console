import { companyAccent, companyInitials } from "@/lib/active-company";
import { cn } from "@/lib/utils";
import { companyIdentity } from "@/lib/company-identity";
import { useState } from "react";

export function CompanyAvatar({ name, slug, className, iconUrl }: { name: string; slug: string; className?: string; iconUrl?: string | null }) {
  const c = companyAccent(slug);
  const icon = iconUrl || companyIdentity(slug).icon;
  const [failed, setFailed] = useState<string | null>(null);
  if (icon && failed !== icon) return (
    <span className={cn("grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-[var(--company-artwork-paper)] ring-1 ring-border", className)}>
      <img src={icon} alt={`${name} icon`} className="size-full object-contain" onError={() => setFailed(icon)} />
    </span>
  );
  return (
    <span
      className={cn("grid size-8 shrink-0 place-items-center rounded-md text-[11px] font-bold tracking-wide shadow-sm ring-1 ring-inset", className)}
      style={{
        background: `color-mix(in oklab, ${c} 14%, transparent)`,
        color: c,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${c} 30%, transparent)`,
      }}
    >
      {companyInitials(name)}
    </span>
  );
}

export function PersonChip({ name, avatar, role }: { name: string | null | undefined; avatar?: string | null; role?: string }) {
  const n = name || "—";
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {avatar ? (
        <img src={avatar} alt="" className="size-6 shrink-0 rounded-full object-cover ring-2 ring-card" />
      ) : (
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground ring-2 ring-card">
          {n.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-semibold">{n}</span>
        {role && <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{role}</span>}
      </span>
    </span>
  );
}
