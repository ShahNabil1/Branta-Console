// Clients: explicit Lead → Client conversion + One Client → Many Projects.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const PROJECT_STATUSES = [
  { key: "planned", label: "Planned" },
  { key: "active", label: "Active" },
  { key: "on_hold", label: "On hold" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["key"];

export interface ClientProject {
  id: string;
  customer_id: string;
  title: string;
  service: string | null;
  status: ProjectStatus;
  starts_on: string | null;
  due_on: string | null;
  budget: number | null;
  currency: string;
  notes: string | null;
  assignee_id: string | null;
  assignee_name?: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface ProjectActivity {
  id: string;
  project_id: string;
  action: string;
  body: string | null;
  actor_name: string | null;
  created_at: string;
}

/** Idempotent: returns existing client for the lead, or creates one. */
export const convertLeadToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ code: string; created: boolean }> => {
    const sb = context.supabase;
    const { data: existing } = await sb
      .from("customers")
      .select("customer_code")
      .eq("converted_from_lead_id", data.leadId)
      .maybeSingle();
    if (existing) return { code: (existing as { customer_code: string }).customer_code, created: false };

    const { data: lead, error } = await sb.from("leads").select("*").eq("id", data.leadId).maybeSingle();
    if (error || !lead) throw new Error("Lead not found");
    const l = lead as Record<string, unknown>;
    if (l.status !== "converted") throw new Error("Lead must be Converted first");
    const { data: contact } = await sb
      .from("lead_contacts")
      .select("email")
      .eq("lead_id", data.leadId)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: ins, error: e2 } = await sb
      .from("customers")
      .insert({
        name: l.name,
        role: l.role,
        company: l.company,
        email: (contact as { email: string } | null)?.email ?? null,
        phone: l.phone,
        whatsapp: l.whatsapp,
        contact_person: l.contact_person,
        source: l.source,
        service: l.service,
        currency: (l.currency as string) ?? "BDT",
        notes: l.notes,
        owner_id: l.owner_id,
        converted_from_lead_id: data.leadId,
        created_by: context.userId,
      } as never)
      .select("customer_code")
      .single();
    if (e2) throw new Error(e2.message);
    await sb.from("lead_activities").insert({
      lead_id: data.leadId,
      actor_id: context.userId,
      kind: "converted",
      body: "Converted to client",
      meta: { customer_code: (ins as { customer_code: string }).customer_code },
    } as never);
    return { code: (ins as { customer_code: string }).customer_code, created: true };
  });

export const getLeadClientCode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: c } = await context.supabase
      .from("customers")
      .select("customer_code")
      .eq("converted_from_lead_id", data.leadId)
      .maybeSingle();
    return { code: (c as { customer_code: string } | null)?.customer_code ?? null };
  });

async function names(sb: any, ids: (string | null)[]) {
  const u = [...new Set(ids.filter(Boolean))] as string[];
  if (!u.length) return new Map<string, string>();
  const { data } = await sb.from("profiles").select("user_id, full_name").in("user_id", u);
  return new Map<string, string>((data ?? []).map((p: any) => [p.user_id, p.full_name ?? ""]));
}

export const listClientProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string }) => z.object({ customerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ projects: ClientProject[]; activity: ProjectActivity[] }> => {
    const sb = context.supabase as any;
    const [{ data: p, error }, { data: a }] = await Promise.all([
      sb.from("client_projects").select("*").eq("customer_id", data.customerId).is("archived_at", null).order("created_at", { ascending: false }),
      sb.from("client_project_activity").select("*").eq("customer_id", data.customerId).order("created_at", { ascending: false }).limit(100),
    ]);
    if (error) throw new Error(error.message);
    const map = await names(sb, [...(p ?? []).map((x: any) => x.assignee_id), ...(a ?? []).map((x: any) => x.actor_id)]);
    return {
      projects: (p ?? []).map((x: any) => ({ ...x, assignee_name: x.assignee_id ? map.get(x.assignee_id) ?? null : null })),
      activity: (a ?? []).map((x: any) => ({ ...x, actor_name: x.actor_id ? map.get(x.actor_id) ?? null : null })),
    };
  });

const ProjectInput = z.object({
  title: z.string().trim().min(2).max(160),
  service: z.string().trim().max(120).nullable().optional(),
  status: z.enum(["planned", "active", "on_hold", "completed", "cancelled"]).default("planned"),
  starts_on: z.string().nullable().optional(),
  due_on: z.string().nullable().optional(),
  budget: z.number().nonnegative().nullable().optional(),
  currency: z.enum(["BDT", "USD"]).default("BDT"),
  notes: z.string().trim().max(4000).nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
});

export const createClientProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProjectInput.extend({ customer_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: row, error } = await sb.from("client_projects").insert({ ...data, created_by: context.userId }).select("id").single();
    if (error) throw new Error(error.message);
    await sb.from("client_project_activity").insert({
      project_id: row.id, customer_id: data.customer_id, actor_id: context.userId, action: "created", body: `Project "${data.title}" created`,
    });
    return { id: row.id as string };
  });

export const updateClientProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProjectInput.partial().extend({ id: z.string().uuid(), archive: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { id, archive, ...patch } = data;
    const { data: before, error: e0 } = await sb.from("client_projects").select("*").eq("id", id).single();
    if (e0) throw new Error(e0.message);
    const upd: Record<string, unknown> = { ...patch };
    if (archive) upd.archived_at = new Date().toISOString();
    const { error } = await sb.from("client_projects").update(upd).eq("id", id);
    if (error) throw new Error(error.message);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, v] of Object.entries(patch)) if ((before as any)[k] !== v && !((before as any)[k] == null && v == null)) changes[k] = { from: (before as any)[k], to: v };
    const label = PROJECT_STATUSES.find((s) => s.key === patch.status)?.label;
    const body = archive
      ? `Project "${before.title}" archived`
      : changes.status
        ? `"${before.title}" status → ${label}`
        : `"${before.title}" updated (${Object.keys(changes).join(", ") || "no changes"})`;
    await sb.from("client_project_activity").insert({
      project_id: id, customer_id: before.customer_id, actor_id: context.userId, action: archive ? "archived" : changes.status ? "status" : "updated", body, changes,
    });
    return { ok: true };
  });

/** Lightweight picker for invoice forms. */
export const listProjectsForPicker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string }) => z.object({ customerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await (context.supabase as any)
      .from("client_projects")
      .select("id, title, service, status")
      .eq("customer_id", data.customerId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    return (rows ?? []) as { id: string; title: string; service: string | null; status: string }[];
  });

/** Project counts per customer for the clients list. */
export const getProjectCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows } = await (context.supabase as any)
      .from("client_projects")
      .select("customer_id, status")
      .is("archived_at", null)
      .limit(5000);
    const out: Record<string, { total: number; active: number }> = {};
    for (const r of (rows ?? []) as { customer_id: string; status: string }[]) {
      const o = (out[r.customer_id] ??= { total: 0, active: 0 });
      o.total++;
      if (r.status === "active") o.active++;
    }
    return out;
  });
