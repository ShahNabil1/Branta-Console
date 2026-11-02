// Companies (Group of Companies). Reads use the caller's RLS; creation is
// admin-only and runs with the admin client after the role check.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "@/lib/db-errors";
import { z } from "zod";

export type CompanyRow = {
  id: string; name: string; slug: string; email: string;
  phone: string | null; address: string | null; website_url: string | null;
  ceo_user_id: string | null; coo_user_id: string | null;
  is_holding: boolean; status: string; created_at: string;
};
export type PersonLite = { id: string; full_name: string | null; email: string | null; avatar_url: string | null };

type Sb = { from: (t: string) => any; rpc: (f: string, a: object) => Promise<{ data: unknown }> };

async function assertAdmin(sb: Sb, userId: string) {
  const [su, ad] = await Promise.all([
    sb.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    sb.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (!su.data && !ad.data) throw new Error("Only admins can manage companies.");
}

async function people(sb: Sb, ids: string[]): Promise<Record<string, PersonLite>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const { data } = await sb.from("profiles").select("id, full_name, email, avatar_url").in("id", uniq);
  return Object.fromEntries(((data ?? []) as PersonLite[]).map((p) => [p.id, p]));
}

export const listCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as Sb;
    const { data, error } = await sb.from("companies").select("*").order("is_holding", { ascending: false }).order("created_at");
    if (error) throw dbError(error);
    const rows = (data ?? []) as CompanyRow[];
    const { data: mem } = await sb.from("company_members").select("company_id").eq("is_active", true);
    const counts: Record<string, number> = {};
    for (const m of (mem ?? []) as { company_id: string }[]) counts[m.company_id] = (counts[m.company_id] ?? 0) + 1;
    const ppl = await people(sb, rows.flatMap((r) => [r.ceo_user_id ?? "", r.coo_user_id ?? ""]));
    return rows.map((r) => ({
      ...r,
      ceo: r.ceo_user_id ? ppl[r.ceo_user_id] ?? null : null,
      coo: r.coo_user_id ? ppl[r.coo_user_id] ?? null : null,
      memberCount: counts[r.id] ?? 0,
    }));
  });

export const getCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: z.string().min(1).max(80) }).parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Sb;
    const { data: row, error } = await sb.from("companies").select("*").eq("slug", data.slug).maybeSingle();
    if (error) throw dbError(error);
    if (!row) return null;
    const c = row as CompanyRow;
    const { data: mem } = await sb.from("company_members").select("user_id, role").eq("company_id", c.id).eq("is_active", true);
    const members = (mem ?? []) as { user_id: string; role: string }[];
    const ppl = await people(sb, [c.ceo_user_id ?? "", c.coo_user_id ?? "", ...members.map((m) => m.user_id)]);
    return {
      ...c,
      ceo: c.ceo_user_id ? ppl[c.ceo_user_id] ?? null : null,
      coo: c.coo_user_id ? ppl[c.coo_user_id] ?? null : null,
      members: members.map((m) => ({ ...m, person: ppl[m.user_id] ?? null })),
    };
  });

export const listCompanyLeaderOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as unknown as Sb;
    await assertAdmin(sb, context.userId);
    const { data, error } = await sb.from("profiles")
      .select("id, full_name, email, avatar_url, job_role, employee_code, deactivated_at").order("full_name");
    if (error) throw dbError(error);
    return ((data ?? []) as (PersonLite & { job_role: string | null; employee_code: string | null; deactivated_at: string | null })[])
      .filter((p) => !p.deactivated_at);
  });

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

export const CreateCompanySchema = z.object({
  name: z.string().trim().min(2, "Company name is required").max(120),
  email: z.string().trim().email("Enter a valid email").max(254),
  phone: opt(30),
  address: opt(500),
  website_url: opt(300).refine((v) => !v || /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v), "Website must start with http:// or https://"),
  ceo_user_id: z.string().uuid("CEO is required"),
  coo_user_id: z.string().uuid().optional().nullable().transform((v) => v ?? null),
});

export function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "company";
}

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreateCompanySchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as unknown as Sb, context.userId);
    if (data.coo_user_id && data.coo_user_id === data.ceo_user_id) throw new Error("CEO and COO must be different people.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Sb;
    const base = slugify(data.name);
    const { data: taken } = await admin.from("companies").select("slug").like("slug", `${base}%`);
    const set = new Set(((taken ?? []) as { slug: string }[]).map((t) => t.slug));
    let slug = base; let n = 2;
    while (set.has(slug)) slug = `${base}-${n++}`;
    const { data: row, error } = await admin.from("companies")
      .insert({ ...data, slug, created_by: context.userId }).select("id, slug").single();
    if (error) throw dbError(error);
    return row as { id: string; slug: string };
  });
