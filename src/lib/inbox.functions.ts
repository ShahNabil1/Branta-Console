// Inbox — fetch hello@brantatech.com mail from the connected Gmail account,
// mirror lightweight metadata into public.inbox_messages, auto-link to leads,
// and expose read/mark/reply helpers to the UI.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway } from "@/lib/connector-gateway.server";

const INBOX_ADDR = "hello@brantatech.com";
// Gmail connector tokens can be narrowed by Google to metadata-only behavior,
// where the API rejects the search `q` parameter. We therefore list INBOX by
// label and filter the lightweight headers locally.
const GMAIL_SYNC_INSPECT_MULTIPLIER = 4;

export interface InboxRow {
  gmail_message_id: string;
  gmail_thread_id: string;
  from_email: string;
  from_name: string | null;
  to_email: string | null;
  subject: string | null;
  snippet: string | null;
  received_at: string;
  is_unread: boolean;
  label_ids: string[];
  lead_id: string | null;
  lead_contact_id: string | null;
  handled_by: string | null;
  handled_by_name?: string | null;
  lead_slug?: string | null;
  lead_name?: string | null;
}

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
}
interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
}
interface GmailProfile {
  emailAddress?: string;
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string | null {
  if (!headers) return null;
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : null;
}

function parseAddress(raw: string | null): { email: string; name: string | null } {
  if (!raw) return { email: "", name: null };
  // Formats: "Name <email@x>" or "email@x"
  const m = raw.match(/^\s*(?:"?([^"<]*)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?\s*$/);
  if (!m) return { email: raw.trim().toLowerCase(), name: null };
  const name = (m[1] ?? "").trim();
  return { email: m[2].trim().toLowerCase(), name: name || null };
}

function headerContainsAddress(headers: GmailHeader[] | undefined, name: string): boolean {
  const raw = headerValue(headers, name);
  return raw ? raw.toLowerCase().includes(INBOX_ADDR) : false;
}

function isDeliveredToInboxAddress(headers: GmailHeader[] | undefined): boolean {
  return (
    headerContainsAddress(headers, "To") ||
    headerContainsAddress(headers, "Cc") ||
    headerContainsAddress(headers, "Delivered-To") ||
    headerContainsAddress(headers, "X-Forwarded-To") ||
    headerContainsAddress(headers, "X-Original-To")
  );
}

function isFromConnectedMailbox(headers: GmailHeader[] | undefined, mailbox: string | null): boolean {
  if (!mailbox) return false;
  return parseAddress(headerValue(headers, "From")).email === mailbox.toLowerCase();
}

function base64UrlDecode(s: string): string {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b.length % 4 === 0 ? "" : "=".repeat(4 - (b.length % 4));
  return Buffer.from(b + pad, "base64").toString("utf-8");
}

interface ExtractedBody {
  html: string | null;
  text: string | null;
  attachments: Array<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
  }>;
}

function extractBody(payload: GmailPart | undefined): ExtractedBody {
  const out: ExtractedBody = { html: null, text: null, attachments: [] };
  const walk = (p?: GmailPart) => {
    if (!p) return;
    const mt = (p.mimeType ?? "").toLowerCase();
    if (p.filename && p.body?.attachmentId) {
      out.attachments.push({
        filename: p.filename,
        mimeType: mt,
        size: p.body.size ?? 0,
        attachmentId: p.body.attachmentId,
      });
    } else if (mt === "text/html" && p.body?.data && !out.html) {
      out.html = base64UrlDecode(p.body.data);
    } else if (mt === "text/plain" && p.body?.data && !out.text) {
      out.text = base64UrlDecode(p.body.data);
    }
    if (p.parts) for (const c of p.parts) walk(c);
  };
  walk(payload);
  return out;
}

async function fetchMessageMetadata(id: string): Promise<GmailMessage> {
  return callGateway<GmailMessage>({
    connector: "google_mail",
    path: `/gmail/v1/users/me/messages/${encodeURIComponent(id)}`,
    query: {
      format: "metadata",
      metadataHeaders: [
        "Subject",
        "From",
        "To",
        "Cc",
        "Date",
        "Delivered-To",
        "X-Forwarded-To",
        "X-Original-To",
      ],
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function autolinkAndUpsert(adminClient: any, m: GmailMessage): Promise<void> {
  const headers = m.payload?.headers;
  const fromRaw = headerValue(headers, "From");
  const toRaw = headerValue(headers, "To");
  const subject = headerValue(headers, "Subject");
  const from = parseAddress(fromRaw);
  const to = parseAddress(toRaw);
  const received = m.internalDate
    ? new Date(Number(m.internalDate)).toISOString()
    : new Date().toISOString();
  const labelIds = m.labelIds ?? [];
  const isUnread = labelIds.includes("UNREAD");

  // Lookup lead by contact email (primary/alt) OR direct lead alt_email.
  let leadId: string | null = null;
  let leadContactId: string | null = null;
  let ownerId: string | null = null;

  if (from.email) {
    const { data: contact } = await adminClient
      .from("lead_contacts")
      .select("id, lead_id")
      .or(`email.eq.${from.email},alt_email.eq.${from.email}`)
      .limit(1)
      .maybeSingle();
    if (contact) {
      leadId = contact.lead_id as string;
      leadContactId = contact.id as string;
    }
    if (leadId) {
      const { data: lead } = await adminClient
        .from("leads")
        .select("owner_id")
        .eq("id", leadId)
        .maybeSingle();
      ownerId = (lead?.owner_id as string | null) ?? null;
    }
  }

  // Check whether this is a first-time insert (needed for notification + activity).
  const { data: existing } = await adminClient
    .from("inbox_messages")
    .select("gmail_message_id, notified")
    .eq("gmail_message_id", m.id)
    .maybeSingle();
  const isNew = !existing;

  await adminClient.from("inbox_messages").upsert(
    {
      gmail_message_id: m.id,
      gmail_thread_id: m.threadId,
      from_email: from.email,
      from_name: from.name,
      to_email: to.email || INBOX_ADDR,
      subject: subject ?? null,
      snippet: m.snippet ?? null,
      received_at: received,
      is_unread: isUnread,
      label_ids: labelIds,
      lead_id: leadId,
      lead_contact_id: leadContactId,
      handled_by: ownerId,
    },
    { onConflict: "gmail_message_id" },
  );

  // First-time seen + linked to a lead → log activity + bump last_activity_at.
  if (isNew && leadId) {
    await adminClient.from("lead_activities").insert({
      lead_id: leadId,
      actor_id: null,
      kind: "inbound_email",
      body: `Reply from ${from.email}${subject ? `: ${subject}` : ""}`,
      meta: {
        provider: "gmail",
        from: from.email,
        subject: subject ?? "",
        gmail_message_id: m.id,
        gmail_thread_id: m.threadId,
      },
    });
    await adminClient
      .from("leads")
      .update({ last_activity_at: received })
      .eq("id", leadId);
    // Mark row so the realtime notifier only fires once.
    await adminClient
      .from("inbox_messages")
      .update({ notified: true })
      .eq("gmail_message_id", m.id);
  }
}

/** Pull latest messages from Gmail and upsert metadata + autolink. */
export const syncInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ maxResults: z.number().min(1).max(100).default(50) }).parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<{ synced: number; inspected: number; warning?: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ownMailbox = await callGateway<GmailProfile>({
      connector: "google_mail",
      path: "/gmail/v1/users/me/profile",
    })
      .then((p) => p.emailAddress?.toLowerCase() ?? null)
      .catch(() => null);

    const wanted = data.maxResults;
    const inspectLimit = Math.min(500, Math.max(wanted, wanted * GMAIL_SYNC_INSPECT_MULTIPLIER));
    const items: Array<{ id: string; threadId: string }> = [];
    let pageToken: string | undefined;
    while (items.length < inspectLimit) {
      const list = await callGateway<GmailListResponse>({
        connector: "google_mail",
        path: "/gmail/v1/users/me/messages",
        query: {
          labelIds: "INBOX",
          maxResults: Math.min(100, inspectLimit - items.length),
          pageToken,
        },
      });
      items.push(...(list.messages ?? []));
      pageToken = list.nextPageToken;
      if (!pageToken || !list.messages?.length) break;
    }
    if (items.length === 0) return { synced: 0, inspected: 0 };
    // Fetch metadata in small parallel batches.
    const BATCH = 8;
    let synced = 0;
    for (let i = 0; i < items.length; i += BATCH) {
      const slice = items.slice(i, i + BATCH);
      const fetched = await Promise.all(
        slice.map((x) => fetchMessageMetadata(x.id).catch(() => null)),
      );
      for (const m of fetched) {
        if (!m) continue;
        const headers = m.payload?.headers;
        if (!isDeliveredToInboxAddress(headers)) continue;
        if (isFromConnectedMailbox(headers, ownMailbox)) continue;
        await autolinkAndUpsert(supabaseAdmin, m);
        synced += 1;
        if (synced >= wanted) break;
      }
      if (synced >= wanted) break;
    }
    return { synced, inspected: items.length };
  });

/** List cached inbox rows (RLS: any authenticated employee). */
export const listInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        filter: z.enum(["all", "unread", "mine", "linked", "unlinked"]).default("all"),
        limit: z.number().min(1).max(500).default(200),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<InboxRow[]> => {
    let q = context.supabase
      .from("inbox_messages")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(data.limit);
    if (data.filter === "unread") q = q.eq("is_unread", true);
    if (data.filter === "mine") q = q.eq("handled_by", context.userId);
    if (data.filter === "linked") q = q.not("lead_id", "is", null);
    if (data.filter === "unlinked") q = q.is("lead_id", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const raw = (rows ?? []) as InboxRow[];

    // Enrich with lead slug/name + handler name.
    const leadIds = Array.from(new Set(raw.map((r) => r.lead_id).filter(Boolean))) as string[];
    const userIds = Array.from(new Set(raw.map((r) => r.handled_by).filter(Boolean))) as string[];
    const leadById = new Map<string, { slug: string | null; name: string | null }>();
    const nameByUser = new Map<string, string | null>();
    if (leadIds.length > 0) {
      const { data: leads } = await context.supabase
        .from("leads")
        .select("id, slug, lead_code, name")
        .in("id", leadIds);
      for (const l of leads ?? [])
        leadById.set(l.id as string, {
          slug: (l.slug as string) ?? (l.lead_code as string) ?? null,
          name: (l.name as string) ?? null,
        });
    }
    if (userIds.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      for (const p of profs ?? [])
        nameByUser.set(p.user_id as string, (p.full_name as string) ?? null);
    }
    return raw.map((r) => ({
      ...r,
      lead_slug: r.lead_id ? leadById.get(r.lead_id)?.slug ?? null : null,
      lead_name: r.lead_id ? leadById.get(r.lead_id)?.name ?? null : null,
      handled_by_name: r.handled_by ? nameByUser.get(r.handled_by) ?? null : null,
    }));
  });

export interface InboxThreadMessage {
  id: string;
  from_email: string;
  from_name: string | null;
  to: string | null;
  cc: string | null;
  subject: string | null;
  date: string;
  message_id_header: string | null;
  in_reply_to: string | null;
  references: string | null;
  html: string | null;
  text: string | null;
  snippet: string | null;
  attachments: Array<{
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
  }>;
  labelIds: string[];
}

export interface InboxThread {
  threadId: string;
  subject: string | null;
  messages: InboxThreadMessage[];
  lead_id: string | null;
  lead_slug: string | null;
  lead_name: string | null;
}

/** Full-format fetch of a Gmail thread (all messages, bodies, attachments). */
export const getInboxThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ threadId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<InboxThread> => {
    const thread = await callGateway<{
      id: string;
      messages?: GmailMessage[];
    }>({
      connector: "google_mail",
      path: `/gmail/v1/users/me/threads/${encodeURIComponent(data.threadId)}`,
      query: { format: "full" },
    });
    const messages = (thread.messages ?? []).map((m): InboxThreadMessage => {
      const headers = m.payload?.headers;
      const from = parseAddress(headerValue(headers, "From"));
      const body = extractBody(m.payload);
      return {
        id: m.id,
        from_email: from.email,
        from_name: from.name,
        to: headerValue(headers, "To"),
        cc: headerValue(headers, "Cc"),
        subject: headerValue(headers, "Subject"),
        date: m.internalDate
          ? new Date(Number(m.internalDate)).toISOString()
          : new Date().toISOString(),
        message_id_header: headerValue(headers, "Message-ID"),
        in_reply_to: headerValue(headers, "In-Reply-To"),
        references: headerValue(headers, "References"),
        html: body.html,
        text: body.text,
        snippet: m.snippet ?? null,
        attachments: body.attachments,
        labelIds: m.labelIds ?? [],
      };
    });

    // Pull cached lead link from the row (first message of the thread suffices).
    const firstId = messages[0]?.id;
    let lead_id: string | null = null;
    let lead_slug: string | null = null;
    let lead_name: string | null = null;
    if (firstId) {
      const { data: row } = await context.supabase
        .from("inbox_messages")
        .select("lead_id")
        .eq("gmail_thread_id", data.threadId)
        .not("lead_id", "is", null)
        .limit(1)
        .maybeSingle();
      lead_id = (row?.lead_id as string | null) ?? null;
      if (lead_id) {
        const { data: lead } = await context.supabase
          .from("leads")
          .select("slug, lead_code, name")
          .eq("id", lead_id)
          .maybeSingle();
        if (lead) {
          lead_slug = (lead.slug as string) ?? (lead.lead_code as string) ?? null;
          lead_name = (lead.name as string) ?? null;
        }
      }
    }

    return {
      threadId: thread.id,
      subject: messages[0]?.subject ?? null,
      messages,
      lead_id,
      lead_slug,
      lead_name,
    };
  });

/** Mark an entire Gmail thread as read + reflect in cache. */
export const markThreadRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ threadId: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // Get all message ids in the thread from cache first.
    const { data: rows } = await context.supabase
      .from("inbox_messages")
      .select("gmail_message_id")
      .eq("gmail_thread_id", data.threadId);
    const ids = (rows ?? []).map((r) => r.gmail_message_id as string);
    // Fire modify calls in parallel (Gmail has no batch modify endpoint via v1 without special formatting).
    await Promise.all(
      ids.map((id) =>
        callGateway({
          connector: "google_mail",
          path: `/gmail/v1/users/me/messages/${encodeURIComponent(id)}/modify`,
          method: "POST",
          body: { removeLabelIds: ["UNREAD"] },
        }).catch(() => null),
      ),
    );
    await context.supabase
      .from("inbox_messages")
      .update({ is_unread: false })
      .eq("gmail_thread_id", data.threadId);
    return { ok: true };
  });

/** Manually assign a thread's messages to a lead (for unlinked or mislinked mail). */
export const linkThreadToLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        threadId: z.string().min(1),
        leadId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    let ownerId: string | null = null;
    if (data.leadId) {
      const { data: lead } = await context.supabase
        .from("leads")
        .select("owner_id")
        .eq("id", data.leadId)
        .maybeSingle();
      ownerId = (lead?.owner_id as string | null) ?? null;
    }
    await context.supabase
      .from("inbox_messages")
      .update({ lead_id: data.leadId, handled_by: ownerId })
      .eq("gmail_thread_id", data.threadId);
    return { ok: true };
  });
