// Server functions for the Leads module.
// Reads are open to any authenticated Branta employee (RLS-enforced).
// Mutations respect the leads RLS policies (owner or admin/super_admin).
import { dbError } from "@/lib/db-errors";
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
  service: string | null;
  services?: string[] | null;
  service_other: string | null;
  owner_id: string | null;
  value_usd: number | null;
  currency: "BDT" | "USD";
  next_action: string | null;
  notes: string | null;
  last_activity_at: string;
  created_by: string | null;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
  owner_name?: string | null;
  owner_avatar_url?: string | null;
  sheet_source?: "manual" | "google_sheets" | null;
  sheet_sync_status?: "pending" | "syncing" | "synced" | "failed" | null;
  sheet_synced_at?: string | null;
  sheet_sync_error?: string | null;
  contact_person?: string | null;
  whatsapp?: string | null;
  requirement?: string | null;
  budget?: number | null;
  timeline?: string | null;
  priority?: "low" | "medium" | "high" | "urgent" | null;
  next_follow_up_at?: string | null;
  created_by_name?: string | null;
  created_by_code?: string | null;
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
  actor_avatar_url?: string | null;
}

// Status is a free-form key validated against lead_status_options in the UI.
const StatusInput = z.string().trim().min(1).max(60);

const CreateInput = z.object({
  name: z.string().trim().min(1).max(160),
  role: z.string().trim().max(120).optional().nullable(),
  company: z.string().trim().max(160).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  email_label: z.string().trim().max(40).optional().nullable(),
  alt_email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  alt_email_label: z.string().trim().max(40).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  phone_label: z.string().trim().max(40).optional().nullable(),
  alt_phone: z.string().trim().max(40).optional().nullable(),
  alt_phone_label: z.string().trim().max(40).optional().nullable(),
  contact_preference: z.string().trim().max(2000).optional().nullable(),
  status: StatusInput.default("new"),
  source: z.string().trim().max(80).optional().nullable(),
  source_other: z.string().trim().max(200).optional().nullable(),
  service: z.string().trim().max(80).optional().nullable(),
  services: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  service_other: z.string().trim().max(200).optional().nullable(),
  owner_id: z.string().uuid().optional().nullable(),
  value_usd: z.number().nonnegative().optional().nullable(),
  currency: z.enum(["BDT", "USD"]).optional(),
  next_action: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  contact_person: z.string().trim().max(160).optional().nullable(),
  whatsapp: z.string().trim().max(40).optional().nullable(),
  requirement: z.string().trim().max(4000).optional().nullable(),
  budget: z.number().nonnegative().optional().nullable(),
  timeline: z.string().trim().max(160).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  next_follow_up_at: z.string().datetime({ offset: true }).optional().nullable(),
});

function fmtBD(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "Asia/Dhaka",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}


const UpdateInput = z.object({
  id: z.string().uuid(),
  // Allow empty name in patches — drafts autosave partial data before finalize.
  patch: CreateInput.partial().extend({
    name: z.string().trim().max(160).optional().nullable(),
  }),
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
    .select("user_id, full_name, avatar_url")
    .in("user_id", ids);
  const nameByUser = new Map<string, string | null>();
  const avatarByUser = new Map<string, string | null>();
  (data ?? []).forEach((p: { user_id: string; full_name: string | null; avatar_url: string | null }) => {
    nameByUser.set(p.user_id, p.full_name);
    avatarByUser.set(p.user_id, p.avatar_url);
  });
  return rows.map((r) => ({
    ...r,
    owner_name: r.owner_id ? nameByUser.get(r.owner_id) ?? null : null,
    owner_avatar_url: r.owner_id ? avatarByUser.get(r.owner_id) ?? null : null,
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

// ---- Duplicate guard ---------------------------------------------------
// Blocks two different leads from sharing the same email or phone.
// Case-insensitive email match; phone match on the last-10 digits.
const normEmailStr = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  return s.includes("@") ? s : null;
};
const normPhoneStr = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const d = v.replace(/\D+/g, "");
  return d.length >= 7 ? d.slice(-10) : null;
};

// Duplicate checks are per company: the same person may be a lead/customer
// of several group companies without conflicting.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function companyLeadIds(supabase: any, companyId: string | null, leadId: string | null): Promise<Set<string>> {
  let co = companyId;
  if (!co && leadId) {
    const { data } = await supabase.from("leads").select("company_id").eq("id", leadId).maybeSingle();
    co = (data?.company_id as string | undefined) ?? null;
  }
  if (!co) {
    const { data } = await supabase.from("companies").select("id").eq("is_holding", true).maybeSingle();
    co = (data?.id as string | undefined) ?? null;
  }
  const ids = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("leads").select("id").eq("company_id", co).range(from, from + 999);
    const rows = (data ?? []) as { id: string }[];
    rows.forEach((r) => ids.add(r.id));
    if (rows.length < 1000) break;
  }
  return ids;
}

async function throwIfDuplicate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  fields: {
    email?: string | null;
    alt_email?: string | null;
    phone?: string | null;
    alt_phone?: string | null;
  },
  excludeLeadId: string | null,
  companyId: string | null = null,
): Promise<void> {
  const emails = [normEmailStr(fields.email), normEmailStr(fields.alt_email)].filter(
    (x): x is string => !!x,
  );
  const phones = [normPhoneStr(fields.phone), normPhoneStr(fields.alt_phone)].filter(
    (x): x is string => !!x,
  );
  if (emails.length === 0 && phones.length === 0) return;
  const scope = await companyLeadIds(supabase, companyId, excludeLeadId);

  const resolveSlug = async (leadId: string): Promise<string> => {
    const { data } = await supabase.from("leads").select("slug").eq("id", leadId).maybeSingle();
    return data?.slug ?? leadId.slice(0, 8);
  };

  // Emails — check leads.alt_email + lead_contacts.email/alt_email.
  for (const e of emails) {
    const { data: L } = await supabase
      .from("leads")
      .select("id, slug")
      .ilike("alt_email", e)
      .limit(5);
    for (const l of (L ?? []) as { id: string; slug: string }[]) {
      if (l.id !== excludeLeadId && scope.has(l.id)) {
        throw new Error(`Email ${e} is already used by lead ${l.slug}`);
      }
    }
    for (const col of ["email", "alt_email"] as const) {
      const { data: C } = await supabase
        .from("lead_contacts")
        .select("lead_id")
        .ilike(col, e)
        .limit(10);
      for (const c of (C ?? []) as { lead_id: string }[]) {
        if (c.lead_id !== excludeLeadId && scope.has(c.lead_id)) {
          const slug = await resolveSlug(c.lead_id);
          throw new Error(`Email ${e} is already used by lead ${slug}`);
        }
      }
    }
  }

  if (phones.length > 0) {
    // Phones are stored unnormalized; scan and compare on last-10.
    const { data: L } = await supabase
      .from("leads")
      .select("id, slug, phone, alt_phone");
    const leadsList = (L ?? []) as Array<{
      id: string;
      slug: string;
      phone: string | null;
      alt_phone: string | null;
    }>;
    for (const l of leadsList) {
      if (l.id === excludeLeadId || !scope.has(l.id)) continue;
      const lp = normPhoneStr(l.phone);
      const la = normPhoneStr(l.alt_phone);
      if ((lp && phones.includes(lp)) || (la && phones.includes(la))) {
        throw new Error(`Phone is already used by lead ${l.slug}`);
      }
    }
    const { data: C } = await supabase
      .from("lead_contacts")
      .select("lead_id, phone, alt_phone");
    const contactsList = (C ?? []) as Array<{
      lead_id: string;
      phone: string | null;
      alt_phone: string | null;
    }>;
    for (const c of contactsList) {
      if (c.lead_id === excludeLeadId || !scope.has(c.lead_id)) continue;
      const cp = normPhoneStr(c.phone);
      const ca = normPhoneStr(c.alt_phone);
      if ((cp && phones.includes(cp)) || (ca && phones.includes(ca))) {
        const slug = await resolveSlug(c.lead_id);
        throw new Error(`Phone is already used by lead ${slug}`);
      }
    }
  }
}

// ---- Inline duplicate check --------------------------------------------
// Same rules as throwIfDuplicate, but returns per-field conflicts instead
// of throwing. Used by the lead-detail form to surface warnings live.
export type DupField = "email" | "alt_email" | "phone" | "alt_phone";
export interface DupConflict {
  field: DupField;
  value: string;
  conflictLeadId: string;
  conflictSlug: string;
  /** Where the duplicate value lives on the other lead. */
  conflictSource:
    | "leads.email"
    | "leads.alt_email"
    | "leads.phone"
    | "leads.alt_phone"
    | "lead_contacts.email"
    | "lead_contacts.alt_email"
    | "lead_contacts.phone"
    | "lead_contacts.alt_phone";
}

export const checkLeadDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      excludeLeadId?: string | null;
      email?: string | null;
      alt_email?: string | null;
      phone?: string | null;
      alt_phone?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<DupConflict[]> => {
    const supabase = context.supabase;
    const excludeLeadId = data.excludeLeadId ?? null;

    const norm = {
      email: normEmailStr(data.email),
      alt_email: normEmailStr(data.alt_email),
      phone: normPhoneStr(data.phone),
      alt_phone: normPhoneStr(data.alt_phone),
    };

    const conflicts: DupConflict[] = [];
    const slugCache = new Map<string, string>();
    const resolveSlug = async (leadId: string): Promise<string> => {
      const cached = slugCache.get(leadId);
      if (cached) return cached;
      const { data: r } = await supabase
        .from("leads")
        .select("slug")
        .eq("id", leadId)
        .maybeSingle();
      const slug = (r?.slug as string | undefined) ?? leadId.slice(0, 8);
      slugCache.set(leadId, slug);
      return slug;
    };

    for (const field of ["email", "alt_email"] as const) {
      const value = norm[field];
      if (!value) continue;

      const { data: L } = await supabase
        .from("leads")
        .select("id, slug")
        .ilike("alt_email", value)
        .limit(5);
      for (const l of (L ?? []) as { id: string; slug: string }[]) {
        if (l.id === excludeLeadId) continue;
        slugCache.set(l.id, l.slug);
        conflicts.push({
          field,
          value,
          conflictLeadId: l.id,
          conflictSlug: l.slug,
          conflictSource: "leads.alt_email",
        });
        break;
      }
      if (conflicts.some((c) => c.field === field)) continue;

      for (const col of ["email", "alt_email"] as const) {
        const { data: C } = await supabase
          .from("lead_contacts")
          .select("lead_id")
          .ilike(col, value)
          .limit(10);
        let hit: string | null = null;
        for (const c of (C ?? []) as { lead_id: string }[]) {
          if (c.lead_id !== excludeLeadId) {
            hit = c.lead_id;
            break;
          }
        }
        if (hit) {
          conflicts.push({
            field,
            value,
            conflictLeadId: hit,
            conflictSlug: await resolveSlug(hit),
            conflictSource: col === "email" ? "lead_contacts.email" : "lead_contacts.alt_email",
          });
          break;
        }
      }
    }

    const phoneTargets: Array<{ field: DupField; value: string }> = [];
    if (norm.phone) phoneTargets.push({ field: "phone", value: norm.phone });
    if (norm.alt_phone) phoneTargets.push({ field: "alt_phone", value: norm.alt_phone });
    if (phoneTargets.length > 0) {
      const { data: L } = await supabase
        .from("leads")
        .select("id, slug, phone, alt_phone");
      const leadsList = (L ?? []) as Array<{
        id: string;
        slug: string;
        phone: string | null;
        alt_phone: string | null;
      }>;
      for (const t of phoneTargets) {
        let matched = false;
        for (const l of leadsList) {
          if (l.id === excludeLeadId) continue;
          const lp = normPhoneStr(l.phone);
          const la = normPhoneStr(l.alt_phone);
          if (lp === t.value) {
            slugCache.set(l.id, l.slug);
            conflicts.push({
              field: t.field,
              value: t.value,
              conflictLeadId: l.id,
              conflictSlug: l.slug,
              conflictSource: "leads.phone",
            });
            matched = true;
            break;
          }
          if (la === t.value) {
            slugCache.set(l.id, l.slug);
            conflicts.push({
              field: t.field,
              value: t.value,
              conflictLeadId: l.id,
              conflictSlug: l.slug,
              conflictSource: "leads.alt_phone",
            });
            matched = true;
            break;
          }
        }
        if (matched) continue;

        const { data: C } = await supabase
          .from("lead_contacts")
          .select("lead_id, phone, alt_phone");
        const contactsList = (C ?? []) as Array<{
          lead_id: string;
          phone: string | null;
          alt_phone: string | null;
        }>;
        for (const c of contactsList) {
          if (c.lead_id === excludeLeadId) continue;
          const cp = normPhoneStr(c.phone);
          const ca = normPhoneStr(c.alt_phone);
          if (cp === t.value) {
            conflicts.push({
              field: t.field,
              value: t.value,
              conflictLeadId: c.lead_id,
              conflictSlug: await resolveSlug(c.lead_id),
              conflictSource: "lead_contacts.phone",
            });
            break;
          }
          if (ca === t.value) {
            conflicts.push({
              field: t.field,
              value: t.value,
              conflictLeadId: c.lead_id,
              conflictSlug: await resolveSlug(c.lead_id),
              conflictSource: "lead_contacts.alt_phone",
            });
            break;
          }
        }
      }
    }

    const scope = await companyLeadIds(supabase, null, excludeLeadId);
    return conflicts.filter((c) => scope.has(c.conflictLeadId));
  });

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspace: z.string().regex(/^[a-z0-9-]{1,80}$/).optional().nullable() }).parse(d ?? {}))
  .handler(async ({ data: input, context }): Promise<LeadRow[]> => {
    const co = await (await LC()).resolveLeadCompany(context.supabase, context.userId, input.workspace);
    const { data, error } = await context.supabase
      .from("leads")
      .select("*")
      .eq("company_id" as never, co.id as never)
      .neq("status", "converted")
      .eq("is_draft", false)
      .order("last_activity_at", { ascending: false })
      .limit(500);
    if (error) throw dbError(error);
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
    if (error) throw dbError(error);
    if (!row) return null;
    const base = { ...(row as unknown as LeadRow), email: null };
    const [withEmail] = await attachPrimaryEmails(context.supabase, [base]);
    const [withName] = await attachOwnerNames(context.supabase, [withEmail]);
    return withName;
  });

export const getLeadBySlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { slug: string; workspace?: string | null }) =>
    z.object({ slug: z.string().trim().min(1).max(40), workspace: z.string().regex(/^[a-z0-9-]{1,80}$/).optional().nullable() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<LeadRow | null> => {
    const co = await (await LC()).resolveLeadCompany(context.supabase, context.userId, data.workspace);
    const { data: row, error } = await context.supabase
      .from("leads")
      .select("*")
      .eq("company_id" as never, co.id as never)
      .ilike("slug", data.slug)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!row) return null;
    const base = { ...(row as unknown as LeadRow), email: null };
    const [withEmail] = await attachPrimaryEmails(context.supabase, [base]);
    const [withName] = await attachOwnerNames(context.supabase, [withEmail]);
    return withName;
  });

export const createLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateInput.extend({ workspace: z.string().regex(/^[a-z0-9-]{1,80}$/).optional().nullable() }).parse(data))
  .handler(async ({ data, context }): Promise<LeadRow> => {
    const co = await (await LC()).resolveLeadCompany(context.supabase, context.userId, data.workspace);
    const email = data.email === "" ? null : data.email ?? null;
    const altEmail = data.alt_email === "" ? null : data.alt_email ?? null;
    await throwIfDuplicate(
      context.supabase,
      { email, alt_email: altEmail, phone: data.phone ?? null, alt_phone: data.alt_phone ?? null },
      null,
      co.id,
    );
    const { data: row, error } = await context.supabase

      .from("leads")
      .insert({
        name: data.name,
        role: data.role ?? null,
        company: data.company ?? null,
        phone: data.phone ?? null,
        phone_label: data.phone_label ?? null,
        alt_phone: data.alt_phone ?? null,
        alt_phone_label: data.alt_phone_label ?? null,
        email_label: data.email_label ?? null,
        alt_email: altEmail,
        alt_email_label: data.alt_email_label ?? null,
        contact_preference: data.contact_preference ?? null,
        status: data.status,
        source: data.source ?? null,
        source_other: data.source_other ?? null,
        service: data.service ?? null,
        services: data.services ?? [],
        service_other: data.service_other ?? null,
        owner_id: data.owner_id ?? context.userId,
        value_usd: data.value_usd ?? null,
        currency: data.currency ?? "BDT",
        next_action: data.next_action ?? null,
        notes: data.notes ?? null,
        contact_person: data.contact_person ?? null,
        whatsapp: data.whatsapp ?? null,
        requirement: data.requirement ?? null,
        budget: data.budget ?? null,
        timeline: data.timeline ?? null,
        priority: data.priority ?? "medium",
        next_follow_up_at: data.next_follow_up_at ?? null,
        created_by: context.userId,
        company_id: co.id,
        is_draft: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      .select("*")
      .single();
    if (error) throw dbError(error);
    if (email) {
      await upsertPrimaryContact(context.supabase, row.id, email, context.userId);
    }
    const createdActs: Array<Record<string, unknown>> = [
      { lead_id: row.id, actor_id: context.userId, kind: "created", body: `Lead created` },
    ];
    if (data.next_follow_up_at) {
      createdActs.push({
        lead_id: row.id,
        actor_id: context.userId,
        kind: "follow_up",
        body: `Follow-up set for ${fmtBD(data.next_follow_up_at)}`,
        meta: { field: "next_follow_up_at", to: data.next_follow_up_at },
      });
    }
    await context.supabase.from("lead_activities").insert(createdActs as never);
    try {
      const { notify } = await import("@/lib/notify.server");
      const ownerId = (row as { owner_id: string | null }).owner_id ?? null;
      const slug = (row as { slug: string | null }).slug ?? row.id.slice(0, 8);
      await notify({
        event: "lead.created",
        recipientRoles: ["super_admin", "admin"],
        vars: { name: data.name, slug, source: data.source ?? "manual" },
        dedupeKey: `lead:${row.id}:created`,
        actorId: context.userId,
      });
      if (ownerId && ownerId !== context.userId) {
        await notify({
          event: "lead.assigned",
          recipients: [ownerId],
          vars: { name: data.name, slug },
          dedupeKey: `lead:${row.id}:assigned:${ownerId}`,
          actorId: context.userId,
        });
      }
    } catch (e) {
      console.error("[createLead] notify failed:", e);
    }
    return { ...(row as unknown as LeadRow), email };
  });

// Draft lead — placeholder row created when clicking "New lead".
// Slug (BT-XX) is assigned automatically by the assign_lead_slug trigger.
const LC = () => import("@/lib/lead-company.server");
export const DRAFT_LEAD_NAME = "Untitled lead";

export const createDraftLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workspace: z.string().regex(/^[a-z0-9-]{1,80}$/).optional().nullable() }).parse(d ?? {}))
  .handler(async ({ data: input, context }): Promise<LeadRow> => {
    const co = await (await LC()).resolveLeadCompany(context.supabase, context.userId, input.workspace);
    const { data: row, error } = await context.supabase
      .from("leads")
      .insert({
        name: DRAFT_LEAD_NAME,
        status: "new",
        currency: "BDT",
        owner_id: context.userId,
        created_by: context.userId,
        company_id: co.id,
        is_draft: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select("*")
      .single();
    if (error) throw dbError(error);
    await context.supabase.from("lead_activities").insert({
      lead_id: row.id,
      actor_id: context.userId,
      kind: "created",
      body: "Draft started",
    });
    return { ...(row as unknown as LeadRow), email: null };
  });

/**
 * Finalize a draft lead → require Name + primary Email, then set is_draft=false.
 * Called by the "Create lead" button on a draft.
 */
export const finalizeLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<LeadRow> => {
    const { data: cur, error: getErr } = await context.supabase
      .from("leads")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!cur) throw new Error("Lead not found");
    const curRow = cur as unknown as LeadRow;

    const trimmedName = (curRow.name ?? "").trim();
    if (!trimmedName || trimmedName === DRAFT_LEAD_NAME) {
      throw new Error("Name is required to create the lead.");
    }

    const { data: pc } = await context.supabase
      .from("lead_contacts")
      .select("email, is_primary")
      .eq("lead_id", data.id);
    const contacts = (pc ?? []) as { email: string; is_primary: boolean }[];
    const primaryEmail =
      contacts.find((c) => c.is_primary)?.email ?? contacts[0]?.email ?? null;
    if (!primaryEmail) {
      throw new Error("Email is required to create the lead.");
    }

    const { data: updated, error } = await context.supabase
      .from("leads")
      .update({ is_draft: false } as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw dbError(error);

    await context.supabase.from("lead_activities").insert({
      lead_id: data.id,
      actor_id: context.userId,
      kind: "created",
      body: "Lead created",
    });


    const { data: fresh } = await context.supabase
      .from("leads").select("*").eq("id", data.id).maybeSingle();
    const base = { ...((fresh ?? updated) as unknown as LeadRow), email: primaryEmail };
    const [withOwner] = await attachOwnerNames(context.supabase, [base]);
    return withOwner;
  });

/**
 * List draft leads. Non-admins see only their own drafts; super admins see all
 * (or filter by a specific creator via ownerFilter='<uuid>').
 */
export const listDraftLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        ownerFilter: z
          .union([z.literal("me"), z.literal("all"), z.string().uuid()])
          .optional(),
        workspace: z.string().regex(/^[a-z0-9-]{1,80}$/).optional().nullable(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<LeadRow[]> => {
    const { data: isSA } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    const isSuperAdmin = !!isSA;
    const co = await (await LC()).resolveLeadCompany(context.supabase, context.userId, data.workspace);

    let q = context.supabase
      .from("leads")
      .select("*")
      .eq("company_id" as never, co.id as never)
      .eq("is_draft", true)
      .order("updated_at", { ascending: false })
      .limit(500);

    if (!isSuperAdmin) {
      q = q.eq("created_by", context.userId);
    } else if (data.ownerFilter && data.ownerFilter !== "all") {
      const uid = data.ownerFilter === "me" ? context.userId : data.ownerFilter;
      q = q.eq("created_by", uid);
    }

    const { data: rows, error } = await q;
    if (error) throw dbError(error);
    const base = ((rows ?? []) as unknown as LeadRow[]).map((r) => ({ ...r, email: null }));
    const withEmails = await attachPrimaryEmails(context.supabase, base);
    return attachOwnerNames(context.supabase, withEmails);
  });



export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateInput.parse(data))
  .handler(async ({ data, context }): Promise<LeadRow> => {
    const patch = { ...data.patch } as Record<string, unknown>;
    // Split email out — it lives in lead_contacts now.
    const emailPatch = patch.email;
    delete patch.email;

    // Gate reassignment on the lead_assign toggle (applies to super_admins too).
    if ("owner_id" in patch) {
      const { data: prior } = await context.supabase
        .from("leads").select("owner_id").eq("id", data.id).maybeSingle();
      if ((prior?.owner_id ?? null) !== (patch.owner_id ?? null)) {
        const { assertCallerPermission } = await import("@/lib/permissions.functions");
        await assertCallerPermission(context.supabase, context.userId, "lead_assign", "Reassign leads");
      }
    }


    // Duplicate guard — block reusing an email/phone that another lead owns.
    await throwIfDuplicate(
      context.supabase,
      {
        email: typeof emailPatch === "string" ? emailPatch : null,
        alt_email: (patch.alt_email as string | null | undefined) ?? null,
        phone: (patch.phone as string | null | undefined) ?? null,
        alt_phone: (patch.alt_phone as string | null | undefined) ?? null,
      },
      data.id,
    );


    // Snapshot prior values for all fields we might update, to log field-level diffs.
    const { data: prior } = await context.supabase
      .from("leads")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    // Snapshot prior primary email (stored in lead_contacts).
    let priorEmail: string | null = null;
    if (typeof emailPatch === "string") {
      const { data: pc } = await context.supabase
        .from("lead_contacts")
        .select("email, is_primary")
        .eq("lead_id", data.id);
      const rows = (pc ?? []) as { email: string; is_primary: boolean }[];
      priorEmail = rows.find((r) => r.is_primary)?.email ?? rows[0]?.email ?? null;
    }

    let row: unknown;
    if (Object.keys(patch).length > 0) {
      const { data: updated, error } = await context.supabase
        .from("leads")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw dbError(error);
      row = updated;
    } else {
      const { data: current, error } = await context.supabase
        .from("leads")
        .select("*")
        .eq("id", data.id)
        .single();
      if (error) throw dbError(error);
      row = current;
    }

    if (typeof emailPatch === "string" && emailPatch.trim()) {
      await upsertPrimaryContact(context.supabase, data.id, emailPatch.trim(), context.userId);
    }

    const FIELD_LABELS: Record<string, string> = {
      name: "Name",
      role: "Role",
      company: "Company",
      email: "Email",
      email_label: "Email label",
      alt_email: "Alt email",
      alt_email_label: "Alt email label",
      phone: "Phone",
      phone_label: "Phone label",
      alt_phone: "Alt phone",
      alt_phone_label: "Alt phone label",
      contact_preference: "Contact preference",
      source: "Source",
      source_other: "Source (other)",
      service: "Service",
      services: "Services",
      service_other: "Service (other)",
      owner_id: "Owner",
      value_usd: "Value",
      currency: "Currency",
      next_action: "Next action",
      notes: "Notes",
      contact_person: "Contact person",
      whatsapp: "WhatsApp",
      requirement: "Requirement",
      budget: "Budget",
      timeline: "Timeline",
      priority: "Priority",
      next_follow_up_at: "Follow-up",
    };
    const fmt = (v: unknown): string => {
      if (v === null || v === undefined || v === "") return "—";
      return String(v);
    };

    // Resolve owner_id → name for readable diffs.
    const ownerIdsToResolve = new Set<string>();
    if ("owner_id" in patch) {
      const before = (prior as Record<string, unknown> | null)?.owner_id;
      const after = patch.owner_id;
      if (typeof before === "string") ownerIdsToResolve.add(before);
      if (typeof after === "string") ownerIdsToResolve.add(after);
    }
    const ownerNames = new Map<string, string>();
    if (ownerIdsToResolve.size > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", Array.from(ownerIdsToResolve));
      (profs ?? []).forEach((p: { user_id: string; full_name: string | null }) =>
        ownerNames.set(p.user_id, p.full_name ?? p.user_id),
      );
    }
    const resolveOwner = (v: unknown) =>
      typeof v === "string" ? ownerNames.get(v) ?? v : v;

    const activityRows: Array<{
      lead_id: string;
      actor_id: string;
      kind: string;
      body: string;
      meta: Record<string, unknown>;
    }> = [];

    if (patch.status && prior && (prior as { status?: string }).status !== patch.status) {
      const note = data.statusChangeNote?.trim();
      const from = (prior as { status: string }).status;
      const to = String(patch.status);
      activityRows.push({
        lead_id: data.id,
        actor_id: context.userId,
        kind: to === "converted" ? "converted" : to === "lost" ? "lost" : to === "proposal_sent" ? "proposal_sent" : "status_change",
        body: note ? `Status: ${from} → ${to} — ${note}` : `Status: ${from} → ${to}`,
        meta: { field: "status", from, to, note: note ?? null },
      });
    }

    const SPECIAL_KIND: Record<string, string> = {
      owner_id: "reassigned",
      priority: "priority_change",
      next_follow_up_at: "follow_up",
    };

    for (const key of Object.keys(patch)) {
      if (key === "status") continue;
      if (!(key in FIELD_LABELS)) continue;
      const label = FIELD_LABELS[key];
      let before: unknown =
        key === "email" ? priorEmail : (prior as Record<string, unknown> | null)?.[key] ?? null;
      let after: unknown =
        key === "email" ? emailPatch ?? null : (patch as Record<string, unknown>)[key];
      if (key === "owner_id") {
        before = resolveOwner(before);
        after = resolveOwner(after);
      }
      const b = before === "" ? null : before;
      const a = after === "" ? null : after;
      if (key === "next_follow_up_at") {
        const tb = b ? new Date(String(b)).getTime() : null;
        const ta = a ? new Date(String(a)).getTime() : null;
        if (tb === ta) continue;
      } else if (JSON.stringify(b ?? null) === JSON.stringify(a ?? null)) continue;
      const hadB = b !== null && b !== undefined;
      const hasA = a !== null && a !== undefined;
      const body =
        key === "next_follow_up_at"
          ? hasA
            ? `Follow-up set for ${fmtBD(String(a))}`
            : "Follow-up cleared"
          : key === "owner_id" && hasA
            ? `Lead reassigned${hadB ? ` from ${fmt(b)}` : ""} to ${fmt(a)}`
            : hadB && hasA
              ? `${label} updated from ${fmt(b)} to ${fmt(a)}`
              : !hadB && hasA
                ? `${label} set to ${fmt(a)}`
                : `${label} cleared (was ${fmt(b)})`;
      activityRows.push({
        lead_id: data.id,
        actor_id: context.userId,
        kind: SPECIAL_KIND[key] ?? "field_change",
        body,
        meta: { field: key, from: (b ?? null) as never, to: (a ?? null) as never },
      });
    }

    if (activityRows.length > 0) {
      await context.supabase.from("lead_activities").insert(activityRows as never);
    }
    try {
      const { notify } = await import("@/lib/notify.server");
      const priorRow = prior as Record<string, unknown> | null;
      const finalRow = row as Record<string, unknown>;
      const slug = (finalRow.slug as string | null) ?? data.id.slice(0, 8);
      const leadName = (finalRow.name as string | null) ?? "Lead";
      if (patch.status && priorRow && priorRow.status !== patch.status) {
        const ownerId = (finalRow.owner_id as string | null) ?? null;
        if (ownerId) {
          await notify({
            event: "lead.status_changed",
            recipients: [ownerId],
            vars: { status: String(patch.status), slug, name: leadName },
            dedupeKey: `lead:${data.id}:status:${String(patch.status)}`,
            actorId: context.userId,
          });
        }
      }
      if ("owner_id" in patch) {
        const beforeOwner = (priorRow?.owner_id as string | null) ?? null;
        const afterOwner = (patch.owner_id as string | null) ?? null;
        if (afterOwner && afterOwner !== beforeOwner && afterOwner !== context.userId) {
          await notify({
            event: "lead.assigned",
            recipients: [afterOwner],
            vars: { name: leadName, slug },
            dedupeKey: `lead:${data.id}:assigned:${afterOwner}:${Date.now()}`,
            actorId: context.userId,
          });
        }
      }
    } catch (e) {
      console.error("[updateLead] notify failed:", e);
    }
    const base = { ...(row as LeadRow), email: null };
    const [withEmail] = await attachPrimaryEmails(context.supabase, [base]);
    return withEmail;
  });

export const deleteLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { assertCallerPermission } = await import("@/lib/permissions.functions");
    await assertCallerPermission(context.supabase, context.userId, "lead_delete", "Delete leads");
    const { error } = await context.supabase.from("leads").delete().eq("id", data.id);
    if (error) throw dbError(error);
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
    if (error) throw dbError(error);
    const activities = (rows ?? []) as LeadActivityRow[];
    const ids = Array.from(
      new Set(activities.map((a) => a.actor_id).filter(Boolean) as string[]),
    );
    if (ids.length === 0) return activities;
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", ids);
    const nameByUser = new Map<string, string | null>();
    const avatarByUser = new Map<string, string | null>();
    (profs ?? []).forEach((p: { user_id: string; full_name: string | null; avatar_url: string | null }) => {
      nameByUser.set(p.user_id, p.full_name);
      avatarByUser.set(p.user_id, p.avatar_url);
    });
    return activities.map((a) => ({
      ...a,
      actor_name: a.actor_id ? nameByUser.get(a.actor_id) ?? null : null,
      actor_avatar_url: a.actor_id ? avatarByUser.get(a.actor_id) ?? null : null,
    }));
  });

export const addLeadActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        kind: z
          .enum([
            "note",
            "call",
            "email",
            "meeting",
            "status_change",
            "update",
            "proposal_sent",
            "portfolio_shared",
            "client_replied",
          ])
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
    if (error) throw dbError(error);
    return row as LeadActivityRow;
  });

// Log a lead view — deduped: skip if the same actor logged a view on the
// same lead in the last 30 minutes (avoids spam from refreshes / remounts).
export const logLeadView = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ leadId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ logged: boolean }> => {
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recent } = await context.supabase
      .from("lead_activities")
      .select("id")
      .eq("lead_id", data.leadId)
      .eq("actor_id", context.userId)
      .eq("kind", "viewed")
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length > 0) return { logged: false };
    const { error } = await context.supabase
      .from("lead_activities")
      .insert({
        lead_id: data.leadId,
        actor_id: context.userId,
        kind: "viewed",
        body: "Lead viewed",
      } as never);
    if (error) return { logged: false };
    return { logged: true };
  });

export interface AssignableUser {
  user_id: string;
  full_name: string | null;
  personal_gmail?: string | null;
}

export const listAssignableUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AssignableUser[]> => {
    const { data, error } = await context.supabase
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("user_id, full_name, personal_gmail" as any)
      .is("deactivated_at" as never, null)
      .order("full_name", { ascending: true })
      .limit(500);
    if (error) throw dbError(error);
    return (data ?? []) as unknown as AssignableUser[];
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
    if (error) throw dbError(error);
    return (rows ?? []) as LeadContactRow[];
  });

const ContactFields = z.object({
  name: z.string().trim().max(160).optional().nullable(),
  role: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().email().max(200),
  label: z.string().trim().max(80).optional().nullable(),
  email_label: z.string().trim().max(40).optional().nullable(),
  alt_email: z
    .string()
    .trim()
    .email()
    .max(200)
    .optional()
    .nullable()
    .or(z.literal("")),
  alt_email_label: z.string().trim().max(40).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  phone_label: z.string().trim().max(40).optional().nullable(),
  alt_phone: z.string().trim().max(40).optional().nullable(),
  alt_phone_label: z.string().trim().max(40).optional().nullable(),
  contact_preference: z.string().trim().max(2000).optional().nullable(),
});

const ContactInput = ContactFields.extend({
  leadId: z.string().uuid(),
  isPrimary: z.boolean().optional(),
});

export const MAX_CONTACTS_PER_LEAD = 10;

export const addLeadContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ContactInput.parse(d))
  .handler(async ({ data, context }): Promise<LeadContactRow> => {
    await throwIfDuplicate(
      context.supabase,
      {
        email: data.email,
        alt_email: data.alt_email ?? null,
        phone: data.phone ?? null,
        alt_phone: data.alt_phone ?? null,
      },
      data.leadId,
    );
    if (data.isPrimary) {
      await context.supabase
        .from("lead_contacts")
        .update({ is_primary: false })
        .eq("lead_id", data.leadId);
    } else {
      const { data: existing } = await context.supabase
        .from("lead_contacts")
        .select("id")
        .eq("lead_id", data.leadId)
        .eq("is_primary", true)
        .maybeSingle();
      if (!existing) data.isPrimary = true;
    }
    const insertRow = {
      lead_id: data.leadId,
      name: data.name ?? null,
      role: data.role ?? null,
      email: data.email,
      label: data.label ?? null,
      email_label: data.email_label ?? null,
      alt_email: data.alt_email && data.alt_email !== "" ? data.alt_email : null,
      alt_email_label: data.alt_email_label ?? null,
      phone: data.phone ?? null,
      phone_label: data.phone_label ?? null,
      alt_phone: data.alt_phone ?? null,
      alt_phone_label: data.alt_phone_label ?? null,
      contact_preference: data.contact_preference ?? null,
      is_primary: data.isPrimary ?? false,
      created_by: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("lead_contacts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(insertRow as any)
      .select("*")
      .single();
    if (error) throw dbError(error);
    const label = data.name || data.email || data.phone || "contact";
    await context.supabase.from("lead_activities").insert({
      lead_id: data.leadId,
      actor_id: context.userId,
      kind: "note",
      body: `Contact added — ${label}${data.isPrimary ? " (primary)" : ""}`,
      meta: { event: "contact_added", contact_id: (row as { id: string }).id, email: data.email, phone: data.phone ?? null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return row as LeadContactRow;
  });

const UpdateContactInput = ContactFields.partial().extend({
  id: z.string().uuid(),
});

const CONTACT_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  role: "Role",
  email: "Email",
  label: "Label",
  email_label: "Email label",
  alt_email: "Alt email",
  alt_email_label: "Alt email label",
  phone: "Phone",
  phone_label: "Phone label",
  alt_phone: "Alt phone",
  alt_phone_label: "Alt phone label",
  contact_preference: "Contact preference",
};

export const updateLeadContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateContactInput.parse(d))
  .handler(async ({ data, context }): Promise<LeadContactRow> => {
    // Snapshot the row before update so we can build a field-level diff.
    const { data: before } = await context.supabase
      .from("lead_contacts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    const beforeRow = before as (Record<string, unknown> & { lead_id: string }) | null;
    await throwIfDuplicate(
      context.supabase,
      {
        email: data.email ?? null,
        alt_email: data.alt_email ?? null,
        phone: data.phone ?? null,
        alt_phone: data.alt_phone ?? null,
      },
      beforeRow?.lead_id ?? null,
    );
    const patch: Record<string, unknown> = {};
    const keys: (keyof typeof data)[] = [
      "name",
      "role",
      "email",
      "label",
      "email_label",
      "alt_email",
      "alt_email_label",
      "phone",
      "phone_label",
      "alt_phone",
      "alt_phone_label",
      "contact_preference",
    ];
    for (const k of keys) {
      const v = data[k];
      if (v !== undefined) {
        patch[k as string] = v === "" ? null : v;
      }
    }
    const { data: row, error } = await context.supabase
      .from("lead_contacts")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw dbError(error);

    // Field-level diff → activity log entries on the underlying lead.
    if (beforeRow) {
      const contactLabel =
        (beforeRow.name as string | null) ||
        (beforeRow.email as string | null) ||
        (beforeRow.phone as string | null) ||
        "contact";
      const activityRows: Array<Record<string, unknown>> = [];
      for (const [k, next] of Object.entries(patch)) {
        const label = CONTACT_FIELD_LABELS[k];
        if (!label) continue;
        const prev = beforeRow[k] ?? null;
        const nextNorm = next ?? null;
        if ((prev ?? "") === (nextNorm ?? "")) continue;
        activityRows.push({
          lead_id: beforeRow.lead_id,
          actor_id: context.userId,
          kind: "note",
          body: `Contact “${contactLabel}” — ${label}: ${prev === null || prev === "" ? "—" : String(prev)} → ${nextNorm === null || nextNorm === "" ? "—" : String(nextNorm)}`,
          meta: { event: "contact_updated", contact_id: data.id, field: k, from: prev, to: nextNorm },
        });
      }
      if (activityRows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await context.supabase.from("lead_activities").insert(activityRows as any);
      }
    }
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
      .select("lead_id, name, email, phone")
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
    if (error) throw dbError(error);
    const label = (c.name as string | null) || (c.email as string | null) || (c.phone as string | null) || "contact";
    await context.supabase.from("lead_activities").insert({
      lead_id: c.lead_id,
      actor_id: context.userId,
      kind: "note",
      body: `Primary contact set — ${label}`,
      meta: { event: "contact_primary_set", contact_id: data.id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { ok: true };
  });

export const deleteLeadContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: before } = await context.supabase
      .from("lead_contacts")
      .select("lead_id, name, email, phone")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase
      .from("lead_contacts")
      .delete()
      .eq("id", data.id);
    if (error) throw dbError(error);
    if (before) {
      const label = (before.name as string | null) || (before.email as string | null) || (before.phone as string | null) || "contact";
      await context.supabase.from("lead_activities").insert({
        lead_id: before.lead_id,
        actor_id: context.userId,
        kind: "note",
        body: `Contact removed — ${label}`,
        meta: { event: "contact_removed", contact_id: data.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }
    return { ok: true };
  });
