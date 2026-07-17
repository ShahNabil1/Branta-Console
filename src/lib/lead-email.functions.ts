// Lead email compose — Resend-only, branded, multi-recipient with variable substitution.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type LeadEmailStatus =
  | "draft"
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "received";

export type LeadEmailProvider = "resend" | "brevo";

export interface LeadEmailRow {
  id: string;
  lead_id: string;
  direction: "outbound" | "inbound";
  provider: LeadEmailProvider | "gmail";
  message_id: string | null;
  thread_id: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  from_email: string | null;
  to_emails: string[];
  cc_emails: string[];
  status: LeadEmailStatus;
  error_message: string | null;
  sent_at: string | null;
  sent_by: string | null;
  created_at: string;
}

// Recipients can be plain strings or {email, name?} objects for per-recipient
// personalization (variable substitution uses the provided name).
const RecipientInput = z.union([
  z.string().trim().email(),
  z.object({
    email: z.string().trim().email(),
    name: z.string().trim().max(160).nullable().optional(),
  }),
]);

const SendInput = z.object({
  leadId: z.string().uuid(),
  to: z.array(RecipientInput).min(1).max(50),
  cc: z.array(z.string().trim().email()).default([]),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(100_000),
  contentType: z.enum(["html", "text"]).default("html"),
  provider: z.enum(["resend", "brevo"]).default("resend"),
});


const LEAD_FROM_EMAIL = "hello@brantatech.com";
const LEAD_FROM_NAME = "Branta Tech";
const RESEND_FROM = `${LEAD_FROM_NAME} <${LEAD_FROM_EMAIL}>`;

/** Public helper: substitute {{tokens}} against a value map. Unknown tokens are left intact. */
export function renderVariables(
  template: string,
  vars: Record<string, string | null | undefined>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v == null || v === "" ? `{{${key}}}` : String(v);
  });
}

function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div style="font:14px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;white-space:pre-wrap">${escaped}</div>`;
}

/**
 * Send a Resend email — one Resend request per recipient so each row tracks its
 * own message_id, deliverability, and future webhook events independently.
 */
export const MAX_CONCURRENT_SENDS = 10;

type ProcessableRow = {
  id: string;
  lead_id: string;
  provider: LeadEmailProvider;
  to_emails: string[];
  cc_emails: string[];
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  sent_by: string | null;
};

async function deliverViaResend(
  row: ProcessableRow,
  leadSlug: string,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const { callGateway } = await import("@/lib/connector-gateway.server");
  const recipient = row.to_emails[0];
  try {
    const resp = await callGateway<{ id: string }>({
      connector: "resend",
      path: "/emails",
      method: "POST",
      body: {
        from: RESEND_FROM,
        to: [recipient],
        cc: row.cc_emails.length ? row.cc_emails : undefined,
        subject: row.subject ?? "",
        html: row.body_html ?? undefined,
        ...(row.body_text && !row.body_html ? { text: row.body_text } : {}),
        tags: [
          { name: "lead_id", value: row.lead_id },
          { name: "lead_slug", value: leadSlug },
          { name: "lead_email_id", value: row.id },
        ],
      },
    });
    return { ok: true, messageId: resp.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function deliverViaBrevo(
  row: ProcessableRow,
  leadSlug: string,
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const { callGateway } = await import("@/lib/connector-gateway.server");
  const recipient = row.to_emails[0];
  try {
    // Brevo returns { messageId: "<...@smtp-relay.mailin.fr>" }
    const resp = await callGateway<{ messageId?: string }>({
      connector: "brevo",
      path: "/smtp/email",
      method: "POST",
      body: {
        sender: { name: LEAD_FROM_NAME, email: LEAD_FROM_EMAIL },
        to: [{ email: recipient }],
        cc: row.cc_emails.length
          ? row.cc_emails.map((e) => ({ email: e }))
          : undefined,
        subject: row.subject ?? "",
        htmlContent: row.body_html ?? undefined,
        ...(row.body_text && !row.body_html ? { textContent: row.body_text } : {}),
        // Brevo tags are string[]; prefix-encoded so the webhook can decode them.
        tags: [
          `lead_id:${row.lead_id}`,
          `lead_slug:${leadSlug}`,
          `lead_email_id:${row.id}`,
        ],
      },
    });
    return { ok: true, messageId: resp.messageId ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Deliver a single queued row via the row's provider. Row must be `sending`. */
async function deliverQueuedRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  row: ProcessableRow,
  leadSlug: string,
): Promise<{ ok: boolean; error?: string }> {
  const recipient = row.to_emails[0];
  const result =
    row.provider === "brevo"
      ? await deliverViaBrevo(row, leadSlug)
      : await deliverViaResend(row, leadSlug);

  if (result.ok) {
    await adminClient
      .from("lead_emails")
      .update({
        status: "sent",
        message_id: result.messageId || null,
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", row.id);
    await adminClient.from("lead_activities").insert({
      lead_id: row.lead_id,
      actor_id: row.sent_by,
      kind: "email",
      body: `Sent to ${recipient} via ${row.provider}: ${row.subject ?? ""}`,
      meta: {
        provider: row.provider,
        to: recipient,
        status: "sent",
        email_id: row.id,
      },
    });
    return { ok: true };
  }

  await adminClient
    .from("lead_emails")
    .update({
      status: "failed",
      error_message: result.error,
      sent_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  await adminClient.from("lead_activities").insert({
    lead_id: row.lead_id,
    actor_id: row.sent_by,
    kind: "email",
    body: `Failed to ${recipient} via ${row.provider}: ${result.error}`,
    meta: {
      provider: row.provider,
      to: recipient,
      status: "failed",
      email_id: row.id,
    },
  });
  return { ok: false, error: result.error };
}

/**
 * Queue then send. Always inserts one lead_emails row per recipient with status
 * `queued`, then claims up to `MAX_CONCURRENT_SENDS − currentlySending` slots,
 * flips those to `sending`, and processes them in parallel. The rest stay
 * queued and are drained by `drainEmailQueue` (called by the client on a poll
 * / realtime tick).
 */
export const sendLeadEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendInput.parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      queued: number;
      processing: number;
      sent: number;
      failed: number;
      rows: LeadEmailRow[];
    }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: lead } = await context.supabase
        .from("leads")
        .select("id, slug, lead_code, name, company, status, owner_id")
        .eq("id", data.leadId)
        .maybeSingle();
      if (!lead) throw new Error("Lead not found");

      let ownerName: string | null = null;
      if (lead.owner_id) {
        const { data: p } = await context.supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", lead.owner_id)
          .maybeSingle();
        ownerName = p?.full_name ?? null;
      }

      const today = new Date().toISOString().slice(0, 10);
      const firstName = (lead.name || "").split(/\s+/)[0] || null;
      const leadSlug = String(lead.slug ?? lead.lead_code);

      // Normalize each recipient to { email, name }. Per-recipient name
      // overrides the lead's default for variable substitution so bulk sends
      // to teammates render individually personalised copies.
      const recipients = data.to.map((r) =>
        typeof r === "string"
          ? { email: r, name: null as string | null }
          : { email: r.email, name: r.name ?? null },
      );

      // Build + insert all rows as `queued`.
      const toInsert = recipients.map((recipient) => {
        const nameForVars = recipient.name?.trim() || lead.name;
        const firstForVars =
          (nameForVars || "").split(/\s+/)[0] || firstName || null;
        const vars = {
          "lead.name": nameForVars,
          "lead.first_name": firstForVars,
          "lead.company": lead.company,
          "lead.email": recipient.email,
          "lead.status": lead.status,
          "lead.slug": leadSlug,
          "owner.name": ownerName,
          today,
        } as Record<string, string | null>;
        const renderedSubject = renderVariables(data.subject, vars);
        const renderedBody = renderVariables(data.body, vars);
        const html = data.contentType === "html" ? renderedBody : textToHtml(renderedBody);
        const text = data.contentType === "text" ? renderedBody : null;
        return {
          lead_id: data.leadId,
          direction: "outbound" as const,
          provider: data.provider,
          subject: renderedSubject,
          body_html: html,
          body_text: text ?? renderedBody,
          from_email: LEAD_FROM_EMAIL,
          to_emails: [recipient.email],
          cc_emails: data.cc,
          status: "queued" as const,
          sent_by: context.userId,
        };
      });


      const { data: inserted, error: insErr } = await context.supabase
        .from("lead_emails")
        .insert(toInsert)
        .select("*");
      if (insErr) throw new Error(insErr.message);
      const rows = (inserted ?? []) as LeadEmailRow[];

      // Claim slots up to MAX_CONCURRENT_SENDS.
      const { count: sendingCount } = await supabaseAdmin
        .from("lead_emails")
        .select("id", { count: "exact", head: true })
        .eq("status", "sending");
      const available = Math.max(0, MAX_CONCURRENT_SENDS - (sendingCount ?? 0));
      const claimIds = rows.slice(0, available).map((r) => r.id);

      let sent = 0;
      let failed = 0;
      if (claimIds.length > 0) {
        const { data: claimed } = await supabaseAdmin
          .from("lead_emails")
          .update({ status: "sending" })
          .in("id", claimIds)
          .eq("status", "queued")
          .select(
            "id, lead_id, provider, to_emails, cc_emails, subject, body_html, body_text, sent_by",
          );
        const claimedRows = (claimed ?? []) as ProcessableRow[];
        const results = await Promise.all(
          claimedRows.map((r) => deliverQueuedRow(supabaseAdmin, r, leadSlug)),
        );
        for (const r of results) (r.ok ? (sent += 1) : (failed += 1));
      }

      return {
        queued: rows.length,
        processing: claimIds.length,
        sent,
        failed,
        rows,
      };
    },
  );

/**
 * Drain oldest queued lead_emails rows across ALL leads up to the concurrency
 * budget. Safe to call frequently — no-op when nothing is available.
 */
export const drainEmailQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async (): Promise<{ processed: number; sent: number; failed: number }> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { count: sendingCount } = await supabaseAdmin
        .from("lead_emails")
        .select("id", { count: "exact", head: true })
        .eq("status", "sending");
      const available = Math.max(0, MAX_CONCURRENT_SENDS - (sendingCount ?? 0));
      if (available === 0) return { processed: 0, sent: 0, failed: 0 };

      const { data: candidates } = await supabaseAdmin
        .from("lead_emails")
        .select("id")
        .eq("status", "queued")
        .in("provider", ["resend", "brevo"])
        .order("created_at", { ascending: true })
        .limit(available);
      const ids = (candidates ?? []).map((r) => r.id);
      if (ids.length === 0) return { processed: 0, sent: 0, failed: 0 };

      const { data: claimed } = await supabaseAdmin
        .from("lead_emails")
        .update({ status: "sending" })
        .in("id", ids)
        .eq("status", "queued")
        .select(
          "id, lead_id, provider, to_emails, cc_emails, subject, body_html, body_text, sent_by",
        );
      const claimedRows = (claimed ?? []) as ProcessableRow[];

      // Resolve lead slugs in one query.
      const leadIds = Array.from(new Set(claimedRows.map((r) => r.lead_id)));
      const { data: leads } = await supabaseAdmin
        .from("leads")
        .select("id, slug, lead_code")
        .in("id", leadIds);
      const slugById = new Map(
        (leads ?? []).map((l) => [l.id as string, String(l.slug ?? l.lead_code)]),
      );

      const results = await Promise.all(
        claimedRows.map((r) =>
          deliverQueuedRow(supabaseAdmin, r, slugById.get(r.lead_id) ?? ""),
        ),
      );
      let sent = 0;
      let failed = 0;
      for (const r of results) (r.ok ? (sent += 1) : (failed += 1));
      return { processed: claimedRows.length, sent, failed };
    },
  );


export const listLeadEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) =>
    z.object({ leadId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<LeadEmailRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("lead_emails")
      .select("*")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as LeadEmailRow[];
  });

// ---------------- Failure management ----------------

export interface FailedEmailRow extends LeadEmailRow {
  lead_name: string | null;
  lead_slug: string | null;
  sent_by_name: string | null;
}

export interface QueueMetrics {
  queued: number;
  sending: number;
  failed: number;
  sentToday: number;
}

export const getQueueMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QueueMetrics> => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [q, s, f, sent] = await Promise.all([
      context.supabase.from("lead_emails").select("id", { count: "exact", head: true }).eq("status", "queued"),
      context.supabase.from("lead_emails").select("id", { count: "exact", head: true }).eq("status", "sending"),
      context.supabase.from("lead_emails").select("id", { count: "exact", head: true }).eq("status", "failed"),
      context.supabase
        .from("lead_emails")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", startOfDay.toISOString()),
    ]);
    return {
      queued: q.count ?? 0,
      sending: s.count ?? 0,
      failed: f.count ?? 0,
      sentToday: sent.count ?? 0,
    };
  });

// ---------------- Provider daily quota (real-time) ----------------
// Free-plan hard caps. Change if the workspace upgrades.
export const RESEND_DAILY_LIMIT = 100;
export const BREVO_DAILY_LIMIT = 300;

export interface ProviderUsage {
  used: number; // sent + sending + queued today (queued reserves capacity)
  sent: number;
  reserved: number; // queued + sending
  limit: number;
}

export interface EmailUsageToday {
  resend: ProviderUsage;
  brevo: ProviderUsage;
  /** ISO of start-of-day used for the counters (server clock, UTC). */
  since: string;
}

/**
 * Count lead_emails per provider for "today" (UTC start-of-day) grouped by
 * status. This is the source of truth for the compose header quota chip:
 * queued/sending consume a slot, sent stays consumed, failed frees the slot.
 * Real-time updates arrive via the client's lead_emails realtime channel.
 */
export const getEmailUsageToday = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EmailUsageToday> => {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const sinceIso = start.toISOString();

    async function countFor(
      provider: "resend" | "brevo",
      statuses: LeadEmailStatus[],
    ): Promise<number> {
      const { count } = await context.supabase
        .from("lead_emails")
        .select("id", { count: "exact", head: true })
        .eq("provider", provider)
        .in("status", statuses)
        .gte("created_at", sinceIso);
      return count ?? 0;
    }

    const [rSent, rReserved, bSent, bReserved] = await Promise.all([
      countFor("resend", ["sent"]),
      countFor("resend", ["queued", "sending"]),
      countFor("brevo", ["sent"]),
      countFor("brevo", ["queued", "sending"]),
    ]);

    return {
      since: sinceIso,
      resend: {
        sent: rSent,
        reserved: rReserved,
        used: rSent + rReserved,
        limit: RESEND_DAILY_LIMIT,
      },
      brevo: {
        sent: bSent,
        reserved: bReserved,
        used: bSent + bReserved,
        limit: BREVO_DAILY_LIMIT,
      },
    };
  });



export const listFailedEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FailedEmailRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("lead_emails")
      .select("*, leads:lead_id(name, slug, lead_code)")
      .eq("status", "failed")
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const raw = (rows ?? []) as unknown as (LeadEmailRow & {
      leads: { name: string | null; slug: string | null; lead_code: string | null } | null;
    })[];
    const senderIds = Array.from(
      new Set(raw.map((r) => r.sent_by).filter(Boolean)),
    ) as string[];
    const nameById = new Map<string, string | null>();
    if (senderIds.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", senderIds);
      for (const p of profs ?? [])
        nameById.set(
          (p as { user_id: string }).user_id,
          (p as { full_name: string | null }).full_name,
        );
    }
    return raw.map((r) => ({
      ...r,
      lead_name: r.leads?.name ?? null,
      lead_slug: r.leads?.slug ?? r.leads?.lead_code ?? null,
      sent_by_name: r.sent_by ? (nameById.get(r.sent_by) ?? null) : null,
    }));
  });

/**
 * Requeue a single failed email so `drainEmailQueue` picks it up again.
 * Optionally switch provider on retry (Resend fallback → Brevo, or vice versa).
 */
export const retryFailedEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; provider?: LeadEmailProvider }) =>
    z
      .object({
        id: z.string().uuid(),
        provider: z.enum(["resend", "brevo"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const patch: {
      status: "queued";
      error_message: null;
      sent_at: null;
      provider?: LeadEmailProvider;
    } = { status: "queued", error_message: null, sent_at: null };
    if (data.provider) patch.provider = data.provider;
    const { error } = await context.supabase
      .from("lead_emails")
      .update(patch)
      .eq("id", data.id)
      .eq("status", "failed");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Bulk requeue every failed email (optionally scoped to one lead). */
export const retryAllFailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId?: string } | undefined) =>
    z.object({ leadId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ retried: number }> => {
    let q = context.supabase
      .from("lead_emails")
      .update({ status: "queued", error_message: null, sent_at: null })
      .eq("status", "failed");
    if (data.leadId) q = q.eq("lead_id", data.leadId);
    const { data: rows, error } = await q.select("id");
    if (error) throw new Error(error.message);
    return { retried: (rows ?? []).length };
  });

// Gmail pull removed in Phase 6 — outbound and inbound are Resend-only.

