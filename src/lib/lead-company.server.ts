// Resolves which company a lead request belongs to. No slug / holding slug =>
// holding company. Sister companies require membership or manage rights.
import { dbError } from "@/lib/db-errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type LeadCompany = { id: string; slug: string; name: string; isHolding: boolean };

export async function resolveLeadCompany(sb: Any, userId: string, slug?: string | null): Promise<LeadCompany> {
  const q = sb.from("companies").select("id, slug, name, is_holding");
  const { data: co, error } = slug ? await q.eq("slug", slug).maybeSingle() : await q.eq("is_holding", true).maybeSingle();
  if (error) throw dbError(error);
  if (!co) throw new Error("Company not found.");
  if (!co.is_holding) {
    const [{ data: member }, { data: manage }] = await Promise.all([
      sb.rpc("is_company_member", { _company: co.id, _user: userId }),
      sb.rpc("can_manage_company", { _company: co.id, _user: userId }),
    ]);
    if (!member && !manage) throw new Error("You are not a member of this company.");
  }
  return { id: co.id, slug: co.slug, name: co.name, isHolding: !!co.is_holding };
}

export const WorkspaceSlug = /^[a-z0-9-]{1,80}$/;
