// Server functions for the Leads module.
// Reads are open to any authenticated Branta employee (RLS-enforced).
// Mutations respect the leads RLS policies (owner or admin/super_admin).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Status keys are dynamic (managed via public.lead_status_options).
// Kept as a string alias for backward-compat with existing imports.
export type LeadStatusDB = string;

export interface LeadRow {
  id: string;
  slug: string;
  lead_code: string;
  name: string;
  role: string | null;
  company: string | null;
  /** Derived from the primary lead_contacts row (email column removed). */
  email: string | null;
  email_label: string | null;
  alt_email: string | null;
  alt_email_label: string | null;
  phone: string | null;
  phone_label: string | null;
  alt_phone: string | null;
  alt_phone_label: string | null;
  contact_preference: string | null;
  status: LeadStatusDB;
  source: string | null;
  source_other: string | null;
  owner_id: string | null;
  value_usd: number | null;
  currency: "BDT" | "USD";
  next_action: string | null;
  notes: string | null;
  last_activity_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  owner_name?: string | null;
}

export interface LeadContactRow {
  id: string;
  lead_id: string;
  name: string | null;
  role: string | null;
  email: string;
  label: string | null;
  email_label: string | null;
  alt_email: string | null;
  alt_email_label: string | null;
  phone: string | null;
  phone_label: string | null;
  alt_phone: string | null;
  alt_phone_label: string | null;
  contact_preference: string | null;
  is_primary: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}


export type LeadActivityMeta = {
  from?: string;
  to?: string;
  [k: string]: string | number | boolean | null | undefined;
};

export interface LeadActivityRow {
  id: string;
  lead_id: string;
  actor_id: string | null;
  kind: string;
  body: string | null;
  meta: LeadActivityMeta;
  created_at: string;
  actor_name?: string | null;
}

// Status is a free-form key validated against lead_status_options in the UI.
const StatusInput = z.string().trim().min(1).max(60);

const CreateInput = z.object({
  name: z.string().trim().min(1).max(160),
  company: z.string().trim().max(160).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
  status: StatusInput.default("new"),
  source: z.string().trim().max(80).optional().nullable(),
  source_other: z.string().trim().max(200).optional().nullable(),
  owner_id: z.string().uuid().optional().nullable(),
  value_usd: z.number().nonnegative().optional().nullable(),
  currency: z.enum(["BDT", "USD"]).optional(),
  next_action: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

const UpdateInput = z.object({
  id: z.string().uuid(),
  patch: CreateInput.partial(),
  statusChangeNote: z.string().trim().max(1000).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function attachPrimaryEmails(supabase: any, rows: LeadRow[]): Promise<LeadRow[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);
  const { data } = await supabase
    .from("lead_contacts")
    .select("lead_id, email, is_primary")
    .in("lead_id", ids);
  const primaryByLead = new Map<string, string>();
  const anyByLead = new Map<string, string>();
  (data ?? []).forEach((c: { lead_id: string; email: string; is_primary: boolean }) => {
    if (c.is_primary) primaryByLead.set(c.lead_id, c.email);
    if (!anyByLead.has(c.lead_id)) anyByLead.set(c.lead_id, c.email);
  });
  return rows.map((r) => ({
    ...r,
    email: primaryByLead.get(r.id) ?? anyByLead.get(r.id) ?? null,
  }));
}

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

async function upsertPrimaryContact(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  leadId: string,
  email: string,
  userId: string,
) {
  // Clear existing primary flag then upsert this email as primary.
  await supabase.from("lead_contacts").update({ is_primary: false }).eq("lead_id", leadId);
  await supabase.from("lead_contacts").upsert(
    {
      lead_id: leadId,
      email,
      label: "Primary",
      is_primary: true,
      created_by: userId,
    },
    { onConflict: "lead_id,email" },
  );
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
    const rows = ((data ?? []) as unknown as LeadRow[]).map((r) => ({ ...r, email: null }));
    const withEmails = await attachPrimaryEmails(context.supabase, rows);
    return attachOwnerNames(context.supabase, withEmails);
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
    const base = { ...(row as unknown as LeadRow), email: null };
    const [withEmail] = await attachPrimaryEmails(context.supabase, [base]);
    const [withName] = await attachOwnerNames(context.supabase, [withEmail]);
    return withName;
  });

export const getLeadBySlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { slug: string }) =>
    z.object({ slug: z.string().trim().min(1).max(40) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<LeadRow | null> => {
    const { data: row, error } = await context.supabase
      .from("leads")
      .select("*")
      .ilike("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const base = { ...(row as unknown as LeadRow), email: null };
    const [withEmail] = await attachPrimaryEmails(context.supabase, [base]);
    const [withName] = await attachOwnerNames(context.supabase, [withEmail]);
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
        phone: data.phone ?? null,
        status: data.status,
        source: data.source ?? null,
        source_other: data.source_other ?? null,
        owner_id: data.owner_id ?? context.userId,
        value_usd: data.value_usd ?? null,
        currency: data.currency ?? "BDT",
        next_action: data.next_action ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    if (email) {
      await upsertPrimaryContact(context.supabase, row.id, email, context.userId);
    }
    await context.supabase.from("lead_activities").insert({
      lead_id: row.id,
      actor_id: context.userId,
      kind: "created",
      body: `Lead created`,
    });
    return { ...(row as unknown as LeadRow), email };
  });

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateInput.parse(data))
  .handler(async ({ data, context }): Promise<LeadRow> => {
    const patch = { ...data.patch } as Record<string, unknown>;
    // Split email out — it lives in lead_contacts now.
    const emailPatch = patch.email;
    delete patch.email;

    const { data: prior } = await context.supabase
      .from("leads")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();

    let row: unknown;
    if (Object.keys(patch).length > 0) {
      const { data: updated, error } = await context.supabase
        .from("leads")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      row = updated;
    } else {
      const { data: current, error } = await context.supabase
        .from("leads")
        .select("*")
        .eq("id", data.id)
        .single();
      if (error) throw new Error(error.message);
      row = current;
    }

    if (typeof emailPatch === "string" && emailPatch.trim()) {
      await upsertPrimaryContact(context.supabase, data.id, emailPatch.trim(), context.userId);
    }

    if (patch.status && prior && prior.status !== patch.status) {
      const note = data.statusChangeNote?.trim();
      const body = note
        ? `Status: ${prior.status} → ${String(patch.status)} — ${note}`
        : `Status: ${prior.status} → ${String(patch.status)}`;
      await context.supabase.from("lead_activities").insert({
        lead_id: data.id,
        actor_id: context.userId,
        kind: "status_change",
        body,
        meta: { from: prior.status, to: String(patch.status), note: note ?? null },
      });
    }
    const base = { ...(row as LeadRow), email: null };
    const [withEmail] = await attachPrimaryEmails(context.supabase, [base]);
    return withEmail;
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

// -------- Lead contacts CRUD --------

export const listLeadContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) =>
    z.object({ leadId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<LeadContactRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("lead_contacts")
      .select("*")
      .eq("lead_id", data.leadId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as LeadContactRow[];
  });

const ContactInput = z.object({
  leadId: z.string().uuid(),
  email: z.string().trim().email().max(200),
  label: z.string().trim().max(80).optional().nullable(),
  isPrimary: z.boolean().optional(),
});

export const addLeadContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ContactInput.parse(d))
  .handler(async ({ data, context }): Promise<LeadContactRow> => {
    if (data.isPrimary) {
      await context.supabase
        .from("lead_contacts")
        .update({ is_primary: false })
        .eq("lead_id", data.leadId);
    } else {
      // If no primary exists, make this one primary.
      const { data: existing } = await context.supabase
        .from("lead_contacts")
        .select("id")
        .eq("lead_id", data.leadId)
        .eq("is_primary", true)
        .maybeSingle();
      if (!existing) data.isPrimary = true;
    }
    const { data: row, error } = await context.supabase
      .from("lead_contacts")
      .insert({
        lead_id: data.leadId,
        email: data.email,
        label: data.label ?? null,
        is_primary: data.isPrimary ?? false,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as LeadContactRow;
  });

export const updateLeadContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        email: z.string().trim().email().max(200).optional(),
        label: z.string().trim().max(80).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<LeadContactRow> => {
    const patch: Record<string, unknown> = {};
    if (data.email) patch.email = data.email;
    if (data.label !== undefined) patch.label = data.label;
    const { data: row, error } = await context.supabase
      .from("lead_contacts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as LeadContactRow;
  });

export const setPrimaryLeadContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: c, error: e1 } = await context.supabase
      .from("lead_contacts")
      .select("lead_id")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!c) throw new Error("Contact not found");
    await context.supabase
      .from("lead_contacts")
      .update({ is_primary: false })
      .eq("lead_id", c.lead_id);
    const { error } = await context.supabase
      .from("lead_contacts")
      .update({ is_primary: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLeadContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("lead_contacts")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
