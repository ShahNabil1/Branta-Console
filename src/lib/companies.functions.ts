// Companies (Group of Companies). Reads use the caller's RLS; creation is
// admin-only and runs with the admin client after the role check.
import { createServerFn } from "@tanstack/react-start";
import { assertGroupAdmin } from "@/lib/group-admin";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "@/lib/db-errors";
import { z } from "zod";

export type CompanyRow = {
  id: string; name: string; slug: string; email: string;
  phone: string | null; address: string | null; website_url: string | null;
  ceo_user_id: string | null; coo_user_id: string | null;
  is_holding: boolean; status: string; created_at: string;
  tagline?: string | null; description?: string | null; company_type?: string | null; industry?: string | null;
  founded_year?: number | null; support_email?: string | null; logo_url?: string | null;
  brand_kit?: { logo_primary?: string | null; logo_inverse?: string | null; mark?: string | null; primary?: string; secondary?: string } | null;
  address_line1?: string | null; division?: string | null; district?: string | null;
  upazila?: string | null; post_office?: string | null; postcode?: string | null; updated_at?: string;
};
export type PersonLite = { id: string; full_name: string | null; avatar_url: string | null; job_role: string | null; employee_code: string | null; email?: string | null };

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
  const { data } = await sb.from("profiles").select("id, full_name, avatar_url, job_role, employee_code").in("id", uniq);
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
    await assertGroupAdmin(sb, context.userId);
    const { data: row, error } = await sb.from("companies").select("*").eq("slug", data.slug).maybeSingle();
    if (error) throw dbError(error);
    if (!row) return null;
    const c = row as CompanyRow;
    const { data: mem } = await sb.from("company_members").select("user_id, role").eq("company_id", c.id).eq("is_active", true);
    const members = (mem ?? []) as { user_id: string; role: string }[];
    const ppl = await people(sb, [c.ceo_user_id ?? "", c.coo_user_id ?? "", ...members.map((m) => m.user_id)]);
    const { data: canManage } = await sb.rpc("can_manage_company", { _company: c.id, _user: context.userId });
    return {
      ...c,
      canManage: !!canManage,
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
      .select("id, user_id, full_name, avatar_url, job_role, employee_code, deactivated_at").order("full_name");
    if (error) throw dbError(error);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: au } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const emails = new Map((au?.users ?? []).map((u) => [u.id, u.email ?? null]));
    return ((data ?? []) as (PersonLite & { user_id: string | null; deactivated_at: string | null })[])
      .filter((p) => !p.deactivated_at)
      .map(({ deactivated_at: _d, user_id: uid, ...p }) => ({ ...p, email: emails.get(uid ?? p.id) ?? null }));
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

// ---------- Company Info: per-section patch (admin or company super admin) ----------
const nul = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));
export const PatchCompanySchema = z.object({
  id: z.string().uuid(),
  patch: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    tagline: nul(160), description: nul(2000), company_type: nul(60), industry: nul(80),
    founded_year: z.number().int().min(1900).max(2100).nullable().optional(),
    email: z.string().trim().email().max(254).optional(),
    support_email: nul(254).refine((v) => !v || z.string().email().safeParse(v).success, "Invalid support email"),
    phone: nul(11).refine((v) => !v || /^01[3-9]\d{8}$/.test(v), "Enter a valid 11-digit BD number"),
    website_url: nul(300).refine((v) => !v || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v), "Enter a domain like example.com"),
    logo_url: nul(500),
    address_line1: nul(200).refine((v) => !v || !/[^A-Za-z0-9\s,./#()'&:-]/.test(v), "English only"),
    division: nul(60), district: nul(60), upazila: nul(80), post_office: nul(80),
    postcode: nul(4).refine((v) => !v || /^\d{4}$/.test(v), "Postcode must be 4 digits"),
    address: nul(500), address_label: nul(60),
    extra_emails: z.array(z.object({ label: z.string().trim().min(1).max(40), value: z.string().trim().email().max(254) })).max(20).optional(),
    extra_phones: z.array(z.object({ label: z.string().trim().min(1).max(40), value: z.string().regex(/^01[3-9]\d{8}$/) })).max(20).optional(),
    offices: z.array(z.object({
      label: z.string().trim().min(1).max(60),
      address_line1: z.string().max(200).regex(/^[A-Za-z0-9\s,./#()'&:-]*$/),
      division: z.string().max(60).nullable(), district: z.string().max(60).nullable(), upazila: z.string().max(80).nullable(),
      post_office: z.string().max(80).nullable(), postcode: z.string().regex(/^\d{4}$/).nullable(),
    })).max(20).optional(),
  }).strict(),
});

export const updateCompanyInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PatchCompanySchema.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Sb;
    await assertGroupAdmin(sb, context.userId);
    const patch = Object.fromEntries(Object.entries(data.patch).filter(([, v]) => v !== undefined));
    if (!Object.keys(patch).length) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as unknown as Sb).from("companies")
      .update({ ...patch, updated_by: context.userId }).eq("id", data.id);
    if (error) throw dbError(error);
    return { ok: true };
  });

// ---- Settings: code prefixes (admin-only writes) ----
export const updateCompanyPrefixes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), prefixes: z.unknown() }).parse(i))
  .handler(async ({ data, context }) => {
    const { PrefixesSchema, prefixConflicts } = await import("@/lib/brand-kit");
    const prefixes = PrefixesSchema.parse(data.prefixes);
    const sb = context.supabase as unknown as Sb;
    await assertGroupAdmin(sb, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Sb;
    const { data: rows, error: e1 } = await admin.from("companies").select("id, name, is_holding, code_prefixes").neq("id", data.id);
    if (e1) throw dbError(e1);
    const others = ((rows ?? []) as { name: string; is_holding: boolean; code_prefixes: Record<string, string> | null }[])
      .map((r) => ({ name: r.name, isHolding: r.is_holding, prefixes: r.code_prefixes ?? {} }));
    const clash = prefixConflicts(prefixes, others);
    if (clash.length) throw new Error(clash.join("; "));
    const { error } = await admin.from("companies").update({ code_prefixes: prefixes, updated_by: context.userId }).eq("id", data.id);
    if (error) throw dbError(error);
    return { ok: true };
  });

// ---- Per-employee workspace access (explicit; never implied) ----
export const WORKSPACE_ROLES = ["member", "manager", "super_admin"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

async function profileIdFor(admin: Sb, authUserId: string): Promise<string> {
  const { data } = await admin.from("profiles").select("id").eq("user_id", authUserId).maybeSingle();
  if (!data?.id) throw new Error("Employee profile not found.");
  return data.id as string;
}

export const listEmployeeWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertGroupAdmin(context.supabase, context.userId, "Only group admins can manage workspace access.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Sb;
    const pid = await profileIdFor(admin, data.userId);
    const [{ data: cos, error }, { data: mem }] = await Promise.all([
      admin.from("companies").select("id, name, slug, is_holding, status, logo_url, brand_kit, ceo_user_id, coo_user_id").order("is_holding", { ascending: false }).order("created_at"),
      admin.from("company_members").select("company_id, role, is_active").eq("user_id", pid),
    ]);
    if (error) throw dbError(error);
    const byCo = new Map(((mem ?? []) as { company_id: string; role: string; is_active: boolean }[]).map((m) => [m.company_id, m]));
    const list = (cos ?? []) as CompanyRow[];
    const hold = list.find((c) => c.is_holding);
    const hm = hold ? byCo.get(hold.id) : undefined;
    const groupAdmin = !!hm?.is_active && hm.role === "super_admin";
    return list.map((c) => {
      const m = byCo.get(c.id);
      const leader = c.ceo_user_id === pid ? "CEO" : c.coo_user_id === pid ? "COO" : groupAdmin && !c.is_holding ? "Group admin" : null;
      return { ...c, role: m?.is_active ? (m.role as WorkspaceRole) : null, leader };
    });
  });

export const setEmployeeWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    userId: z.string().uuid(),
    companyId: z.string().uuid(),
    role: z.enum(WORKSPACE_ROLES).nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertGroupAdmin(context.supabase, context.userId, "Only group admins can manage workspace access.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Sb;
    const pid = await profileIdFor(admin, data.userId);
    const { data: co } = await admin.from("companies").select("ceo_user_id, coo_user_id, is_holding").eq("id", data.companyId).maybeSingle();
    if (!co) throw new Error("Company not found.");
    if ((co.ceo_user_id === pid || co.coo_user_id === pid) && data.role !== "super_admin")
      throw new Error("CEO/COO always keep full access. Change the company leadership first.");
    if (!co.is_holding && data.role !== "super_admin") {
      const { data: h } = await admin.from("companies").select("id").eq("is_holding", true).maybeSingle();
      const { data: hm } = h ? await admin.from("company_members").select("role, is_active").eq("company_id", h.id).eq("user_id", pid).maybeSingle() : { data: null };
      if (hm?.is_active && hm.role === "super_admin")
        throw new Error("Branta Tech company admins always have full access to every workspace.");
    }
    const row = data.role
      ? { company_id: data.companyId, user_id: pid, role: data.role, is_active: true }
      : { company_id: data.companyId, user_id: pid, role: "member", is_active: false };
    const { error } = await admin.from("company_members").upsert(row, { onConflict: "company_id,user_id" });
    if (error) throw dbError(error);
    return { ok: true as const };
  });
