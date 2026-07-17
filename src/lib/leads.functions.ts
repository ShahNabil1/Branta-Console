// Server functions for the Leads module.
// Reads are open to any authenticated Branta employee (RLS-enforced).
// Mutations respect the leads RLS policies (owner or admin/super_admin).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type LeadStatusDB =
  | "new"
  | "contacted"
  | "viewed"
  | "meeting"
  | "converted"
  | "lost";

export interface LeadRow {
  id: string;
  lead_code: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: LeadStatusDB;
  source: string | null;
  owner_id: string | null;
  value_usd: number | null;
  next_action: string | null;
  notes: string | null;
  last_activity_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  owner_name?: string | null;
}

export interface LeadActivityRow {
  id: string;
  lead_id: string;
  actor_id: string | null;
  kind: string;
  body: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  actor_name?: string | null;
}

const StatusEnum = z.enum([
  "new",
  "contacted",
  "viewed",
  "meeting",
  "converted",
  "lost",
]);

const CreateInput = z.object({
  name: z.string().trim().min(1).max(160),
  company: z.string().trim().max(160).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
  status: StatusEnum.default("new"),
  source: z.string().trim().max(80).optional().nullable(),
  owner_id: z.string().uuid().optional().nullable(),
  value_usd: z.number().nonnegative().optional().nullable(),
  next_action: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

const UpdateInput = z.object({
  id: z.string().uuid(),
  patch: CreateInput.partial(),
});

async function attachOwnerNames(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rows: LeadRow[],
): Promise<LeadRow[]> {
  const ids = Array.from(
    new Set(rows.map((r) => r.owner_id).filter(Boolean) as string[]),
  );
  if (ids.length === 0) return rows;
  const { data } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .in("user_id", ids);
  const nameByUser = new Map<string, string | null>();
  (data ?? []).forEach((p: { user_id: string; full_name: string | null }) =>
    nameByUser.set(p.user_id, p.full_name),
  );
  return rows.map((r) => ({
    ...r,
    owner_name: r.owner_id ? nameByUser.get(r.owner_id) ?? null : null,
  }));
}

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeadRow[]> => {
    const { data, error } = await context.supabase
      .from("leads")
      .select("*")
      .order("last_activity_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return attachOwnerNames(context.supabase, (data ?? []) as LeadRow[]);
  });

export const getLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<LeadRow | null> => {
    const { data: row, error } = await context.supabase
      .from("leads")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const [withName] = await attachOwnerNames(context.supabase, [row as LeadRow]);
    return withName;
  });

export const createLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateInput.parse(data))
  .handler(async ({ data, context }): Promise<LeadRow> => {
    const email = data.email === "" ? null : data.email ?? null;
    const { data: row, error } = await context.supabase
      .from("leads")
      .insert({
        name: data.name,
        company: data.company ?? null,
        email,
        phone: data.phone ?? null,
        status: data.status,
        source: data.source ?? null,
        owner_id: data.owner_id ?? context.userId,
        value_usd: data.value_usd ?? null,
        next_action: data.next_action ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    // Seed an initial activity row
    await context.supabase.from("lead_activities").insert({
      lead_id: row.id,
      actor_id: context.userId,
      kind: "created",
      body: `Lead created`,
    });
    return row as LeadRow;
  });

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateInput.parse(data))
  .handler(async ({ data, context }): Promise<LeadRow> => {
    const patch = { ...data.patch } as Record<string, unknown>;
    if (patch.email === "") patch.email = null;

    // Snapshot the prior status so we can log a status_change activity
    const { data: prior } = await context.supabase
      .from("leads")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();

    const { data: row, error } = await context.supabase
      .from("leads")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (patch.status && prior && prior.status !== patch.status) {
      await context.supabase.from("lead_activities").insert({
        lead_id: data.id,
        actor_id: context.userId,
        kind: "status_change",
        body: `Status: ${prior.status} → ${patch.status}`,
        meta: { from: prior.status, to: patch.status },
      });
    }
    return row as LeadRow;
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listLeadActivities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { leadId: string }) =>
    z.object({ leadId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<LeadActivityRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("lead_activities")
      .select("*")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const activities = (rows ?? []) as LeadActivityRow[];
    const ids = Array.from(
      new Set(activities.map((a) => a.actor_id).filter(Boolean) as string[]),
    );
    if (ids.length === 0) return activities;
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", ids);
    const nameByUser = new Map<string, string | null>();
    (profs ?? []).forEach((p: { user_id: string; full_name: string | null }) =>
      nameByUser.set(p.user_id, p.full_name),
    );
    return activities.map((a) => ({
      ...a,
      actor_name: a.actor_id ? nameByUser.get(a.actor_id) ?? null : null,
    }));
  });

export const addLeadActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        kind: z
          .enum(["note", "call", "email", "meeting", "status_change"])
          .default("note"),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<LeadActivityRow> => {
    const { data: row, error } = await context.supabase
      .from("lead_activities")
      .insert({
        lead_id: data.leadId,
        actor_id: context.userId,
        kind: data.kind,
        body: data.body,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as LeadActivityRow;
  });

export interface AssignableUser {
  user_id: string;
  full_name: string | null;
}

export const listAssignableUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AssignableUser[]> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("user_id, full_name")
      .order("full_name", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as AssignableUser[];
  });
