import { useActiveCompany } from "@/components/company/company-switcher";
import { toCompanyPath } from "@/lib/org-path";

/** Maps a plain /app/... path into the active company's workspace URL. */
export function useCompanyPath() {
  const a = useActiveCompany().active;
  return (path: string) => (a && !a.is_holding ? toCompanyPath(path, a.slug, false) : path);
}
