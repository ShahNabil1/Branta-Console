import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCompanyPath } from "@/components/company/use-company-path";

/** Back link to the Leads list of the company currently open. */
export function BackToLeadsLink({ className, children, ...rest }: { className?: string; children: ReactNode; "aria-label"?: string }) {
  const companyPath = useCompanyPath();
  return <Link to={companyPath("/app/leads") as "/app/leads"} className={className} {...rest}>{children}</Link>;
}
