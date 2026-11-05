// Lead transfer requests: an assigned employee (without lead_assign) asks a
// super admin to reassign a lead to another teammate. Super admins approve
// or reject in bulk from the Transfers page.
import { dbError } from "@/lib/db-errors";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface TransferRequestRow {
  id: string;
  lead_id: string;
  lead_slug: string | null;
  lead_name: string | null;
  requester_id: string;
  requester_name: string | null;
  from_user_id: string | null;
  from_user_name: string | null;
  to_user_id: string;
  to_user_name: string | null;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  updated_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSuperAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (error) throw dbError(error);
  if (!data) throw new Error("Forbidden: super_admin required");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nameMap(supabase: any, ids: string[]) {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (uniq.length === 0) return new Map<string, string>();
  const { data } = await supabase
    .from("profiles")
    .select("user_id, full_name")
    .in("user_id", uniq);
  const m = new Map<string, string>();
  (data ?? []).forEach((p: { user_id: string; full_name: string | null }) => {
    if (p.full_name) m.set(p.user_id, p.full_name);
  });
  return m;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function hydrate(supabase: any, rows: any[]): Promise<TransferRequestRow[]> {
  if (!rows || rows.length === 0) return [];
  const ids = new Set<string>();
  rows.forEach((r) => {
    if (r.requester_id) ids.add(r.requester_id);
    if (r.from_user_id) ids.add(r.from_user_id);
    if (r.to_user_id) ids.add(r.to_user_id);
    if (r.decided_by) ids.add(r.decided_by);
  });
  const leadIds = rows.map((r) => r.lead_id);
  const [names, leadRes] = await Promise.all([
    nameMap(supabase, Array.from(ids)),
    supabase.from("leads").select("id, slug, lead_code, name").in("id", leadIds),
  ]);
  const leadMap = new Map<string, { slug: string | null; code: string | null; name: string | null }>();
  (leadRes.data ?? []).forEach(
    (l: { id: string; slug: string | null; lead_code: string | null; name: string | null }) => {
      leadMap.set(l.id, { slug: l.slug, code: l.lead_code, name: l.name });
    },
  );
  return rows.map((r) => {
    const lead = leadMap.get(r.lead_id);
    return {
      id: r.id,
      lead_id: r.lead_id,
      lead_slug: lead?.slug ?? lead?.code ?? null,
      lead_name: lead?.name ?? null,
      requester_id: r.requester_id,
      requester_name: names.get(r.requester_id) ?? null,
      from_user_id: r.from_user_id,
      from_user_name: r.from_user_id ? names.get(r.from_user_id) ?? null : null,
      to_user_id: r.to_user_id,
      to_user_name: names.get(r.to_user_id) ?? null,
      status: r.status,
      note: r.note,
      decided_by: r.decided_by,
      decided_by_name: r.decided_by ? names.get(r.decided_by) ?? null : null,
      decided_at: r.decided_at,
      decision_note: r.decision_note,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });
}

export const requestLeadTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        toUserId: z.string().uuid(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.toUserId === context.userId) {
      throw new Error("You can't request a transfer to yourself.");
    }
    // Fetch the lead to snapshot the current owner (from_user_id).
    const { data: lead, error: leadErr } = await context.supabase
      .from("leads")
      .select("id, owner_id, slug, lead_code, name")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) throw new Error("Lead not found");

    // Insert the request. RLS enforces that the caller must be the current
    // lead owner (or super admin).
    const { data: inserted, error } = await context.supabase
      .from("lead_transfer_requests")
      .insert({
        lead_id: data.leadId,
        requester_id: context.userId,
        from_user_id: lead.owner_id ?? context.userId,
        to_user_id: data.toUserId,
        note: data.note ?? null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw dbError(error);

    // Best-effort activity log on the lead.
    const [toProfile, fromName] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", data.toUserId)
        .maybeSingle(),
      context.supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    const toName =
      (toProfile.data as { full_name: string | null } | null)?.full_name ??
      data.toUserId.slice(0, 8);
    const requesterName =
      (fromName.data as { full_name: string | null } | null)?.full_name ??
      "An employee";
    await context.supabase.from("lead_activities").insert({
      lead_id: data.leadId,
      actor_id: context.userId,
      kind: "note",
      body: `🔄 Transfer requested — ${requesterName} → ${toName}${
        data.note ? ` · Note: ${data.note}` : ""
      }`,
    } as never);

    try {
      const { notify } = await import("@/lib/notify.server");
      const recipients: string[] = [];
      if (lead.owner_id && lead.owner_id !== context.userId) recipients.push(lead.owner_id as string);
      await notify({
        event: "lead.transfer.requested",
        recipients,
        recipientRoles: ["super_admin"],
        vars: {
          requester: requesterName,
          slug: (lead.slug as string | null) ?? (lead.lead_code as string | null) ?? data.leadId.slice(0, 8),
        },
        dedupeKey: `transfer:${inserted?.id}:requested`,
        actorId: context.userId,
      });
    } catch (e) {
      console.error("[requestLeadTransfer] notify failed:", e);
    }

    return { ok: true as const, id: inserted?.id as string };
  });

export const listMyTransferRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TransferRequestRow[]> => {
    const { data, error } = await context.supabase
      .from("lead_transfer_requests")
      .select("*")
      .eq("requester_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw dbError(error);
    return hydrate(context.supabase, data ?? []);
  });

export const listMyIncomingTransfers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TransferRequestRow[]> => {
    const { data, error } = await context.supabase
      .from("lead_transfer_requests")
      .select("*")
      .eq("to_user_id", context.userId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw dbError(error);
    return hydrate(context.supabase, data ?? []);
  });

export const listAllTransferRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<TransferRequestRow[]> => {
    await assertSuperAdmin(context.supabase, context.userId);
    let q = context.supabase
      .from("lead_transfer_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw dbError(error);
    return hydrate(context.supabase, rows ?? []);
  });

export const decideTransferRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(200),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);

    const { data: rows, error: fetchErr } = await context.supabase
      .from("lead_transfer_requests")
      .select("*")
      .in("id", data.ids)
      .eq("status", "pending");
    if (fetchErr) throw new Error(fetchErr.message);
    const pending = (rows ?? []) as Array<{
      id: string;
      lead_id: string;
      from_user_id: string | null;
      to_user_id: string;
      requester_id: string;
    }>;

    if (pending.length === 0) return { ok: true as const, count: 0 };

    const deciderProfile = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", context.userId)
      .maybeSingle();
    const deciderName =
      (deciderProfile.data as { full_name: string | null } | null)?.full_name ??
      "A super admin";

    for (const r of pending) {
      // If approving, flip lead ownership first (super admin RLS covers this).
      if (data.decision === "approved") {
        await context.supabase
          .from("leads")
          .update({ owner_id: r.to_user_id })
          .eq("id", r.lead_id);
      }

      await context.supabase
        .from("lead_transfer_requests")
        .update({
          status: data.decision,
          decided_by: context.userId,
          decided_at: new Date().toISOString(),
          decision_note: data.note ?? null,
        })
        .eq("id", r.id);

      // Activity log on the lead.
      const [toP, fromP] = await Promise.all([
        context.supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", r.to_user_id)
          .maybeSingle(),
        r.from_user_id
          ? context.supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", r.from_user_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const toName =
        (toP.data as { full_name: string | null } | null)?.full_name ??
        r.to_user_id.slice(0, 8);
      const fromName =
        (fromP.data as { full_name: string | null } | null)?.full_name ??
        "previous owner";
      const verb = data.decision === "approved" ? "approved" : "rejected";
      const suffix =
        data.decision === "approved"
          ? ` — reassigned ${fromName} → ${toName}`
          : "";
      await context.supabase.from("lead_activities").insert({
        lead_id: r.lead_id,
        actor_id: context.userId,
        kind: "note",
        body: `🔄 Transfer ${verb} by ${deciderName}${suffix}${
          data.note ? ` · Note: ${data.note}` : ""
        }`,
      } as never);

      try {
        const { notify } = await import("@/lib/notify.server");
        const { data: leadRow } = await context.supabase
          .from("leads").select("slug, lead_code, name")
          .eq("id", r.lead_id).maybeSingle();
        const slug = (leadRow as { slug?: string; lead_code?: string } | null)?.slug
          ?? (leadRow as { lead_code?: string } | null)?.lead_code ?? r.lead_id.slice(0, 8);
        const name = (leadRow as { name?: string } | null)?.name ?? "Lead";
        await notify({
          event: "lead.transfer.decided",
          recipients: [r.requester_id],
          vars: { decision: verb, slug },
          dedupeKey: `transfer:${r.id}:decided`,
          actorId: context.userId,
        });
        if (data.decision === "approved" && r.to_user_id !== context.userId) {
          await notify({
            event: "lead.assigned",
            recipients: [r.to_user_id],
            vars: { name, slug },
            dedupeKey: `lead:${r.lead_id}:assigned:${r.to_user_id}:${r.id}`,
            actorId: context.userId,
          });
        }
      } catch (e) {
        console.error("[decideTransferRequests] notify failed:", e);
      }
    }

    return { ok: true as const, count: pending.length };
  });
