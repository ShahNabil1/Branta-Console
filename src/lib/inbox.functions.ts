// Inbox — Gmail-first. List and thread reads go directly to the connected
// Gmail account (hello@brantatech.com forwarded to brantatech@gmail.com);
// public.inbox_messages is used ONLY as a lightweight dedupe/notifier ledger
// for NEW lead-linked messages so the realtime notifier fires exactly once
// per inbound reply. Everything shown in the UI is fetched live from Gmail.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callGateway } from "@/lib/connector-gateway.server";

const INBOX_ADDR = "hello@brantatech.com";

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

const THREAD_METADATA_HEADERS = [
  "Subject",
  "From",
  "To",
  "Cc",
  "Date",
  "Message-ID",
  "In-Reply-To",
  "References",
];

const LIST_METADATA_HEADERS = [
  "Subject",
  "From",
  "To",
  "Cc",
  "Date",
  "Delivered-To",
  "X-Forwarded-To",
  "X-Original-To",
];

function headerValue(headers: GmailHeader[] | undefined, name: string): string | null {
  if (!headers) return null;
  const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : null;
}

function parseAddress(raw: string | null): { email: string; name: string | null } {
  if (!raw) return { email: "", name: null };
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
      metadataHeaders: LIST_METADATA_HEADERS,
    },
  });
}

// ---------------------------------------------------------------------------
// Shared helper: list Gmail INBOX metadata for messages delivered to
// hello@brantatech.com. Uses Gmail's `q` search (works with gmail.readonly)
// so we don't have to fetch metadata for hundreds of unrelated messages.
// ---------------------------------------------------------------------------

// Common no-reply / transactional / alert sender patterns to exclude so
// automated mail from other companies doesn't clutter the shared inbox.
const NOISE_FROM_PATTERNS = [
  "noreply",
  "no-reply",
  "no_reply",
  "donotreply",
  "do-not-reply",
  "notifications",
  "notification",
  "alerts",
  "alert",
  "mailer-daemon",
  "postmaster",
  "bounce",
  "bounces",
  "support",
  "updates",
  "newsletter",
  "news",
  "billing",
  "invoice",
  "receipts",
  "receipt",
  "hello",
  "team",
  "info",
  "account",
  "security",
];

function buildInboxQuery(): string {
  const to = `(to:${INBOX_ADDR} OR deliveredto:${INBOX_ADDR} OR cc:${INBOX_ADDR})`;
  const noise = NOISE_FROM_PATTERNS.map((p) => `-from:${p}@`).join(" ");
  // Also exclude Gmail's built-in Promotions/Updates/Forums/Social categories
  // (transactional/marketing mail lands in these) and anything from ourselves.
  return `in:inbox ${to} -from:me -category:promotions -category:updates -category:forums -category:social ${noise}`;
}

async function fetchInboxGmail(wanted: number): Promise<GmailMessage[]> {
  const ownMailboxPromise = callGateway<GmailProfile>({
    connector: "google_mail",
    path: "/gmail/v1/users/me/profile",
  })
    .then((p) => p.emailAddress?.toLowerCase() ?? null)
    .catch(() => null);

  // Server-side filter: only messages in INBOX addressed to our alias, and
  // NOT sent by the connected mailbox itself.
  const list = await callGateway<GmailListResponse>({
    connector: "google_mail",
    path: "/gmail/v1/users/me/messages",
    query: {
      maxResults: Math.min(100, wanted),
      q: buildInboxQuery(),
    },
  });
  const items = list.messages ?? [];
  if (items.length === 0) return [];

  // Parallel metadata fetch — Gmail already filtered, so this is a small set.
  const fetched = await Promise.all(
    items.slice(0, wanted).map((x) => fetchMessageMetadata(x.id).catch(() => null)),
  );
  const ownMailbox = await ownMailboxPromise;
  return fetched.filter((m): m is GmailMessage => {
    if (!m) return false;
    if (isFromConnectedMailbox(m.payload?.headers, ownMailbox)) return false;
    return true;
  });
}

// Kept for backwards-compat; no longer used after the q-based rewrite.
void isDeliveredToInboxAddress;

// ---------------------------------------------------------------------------
// syncInbox: notifier-only path. Detects NEW lead-linked messages and writes
// (a) lead_activities row, (b) leads.last_activity_at bump, (c) minimal
// inbox_messages ledger row (for realtime notifier dedupe). Non-lead-linked
// messages are NOT written to the database.
// ---------------------------------------------------------------------------
export const syncInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ maxResults: z.number().min(1).max(100).default(50) }).parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<{ synced: number; newLinked: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const messages = await fetchInboxGmail(data.maxResults);
    if (messages.length === 0) return { synced: 0, newLinked: 0 };

    // Batch: find lead links for all unique from_emails at once.
    const fromEmails = Array.from(
      new Set(
        messages
          .map((m) => parseAddress(headerValue(m.payload?.headers, "From")).email)
          .filter(Boolean),
      ),
    );
    if (fromEmails.length === 0) return { synced: messages.length, newLinked: 0 };

    const orExpr = fromEmails
      .flatMap((e) => [`email.eq.${e}`, `alt_email.eq.${e}`])
      .join(",");
    const { data: contacts } = await supabaseAdmin
      .from("lead_contacts")
      .select("id, lead_id, email, alt_email");
    // Filter locally (Supabase or() has length limits with many emails).
    const byEmail = new Map<string, { leadId: string; contactId: string }>();
    for (const c of contacts ?? []) {
      const emails = [c.email as string | null, c.alt_email as string | null]
        .filter(Boolean)
        .map((x) => (x as string).toLowerCase());
      for (const e of emails) {
        if (fromEmails.includes(e) && !byEmail.has(e))
          byEmail.set(e, { leadId: c.lead_id as string, contactId: c.id as string });
      }
    }
    void orExpr;

    // Filter to only lead-linked messages that we haven't already logged.
    const linkedMsgs = messages
      .map((m) => {
        const from = parseAddress(headerValue(m.payload?.headers, "From"));
        const link = byEmail.get(from.email);
        return link ? { m, from, ...link } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (linkedMsgs.length === 0) return { synced: messages.length, newLinked: 0 };

    // Check which ones are already in the ledger.
    const ids = linkedMsgs.map((x) => x.m.id);
    const { data: existing } = await supabaseAdmin
      .from("inbox_messages")
      .select("gmail_message_id")
      .in("gmail_message_id", ids);
    const seen = new Set((existing ?? []).map((r) => r.gmail_message_id as string));
    const fresh = linkedMsgs.filter((x) => !seen.has(x.m.id));

    let newLinked = 0;
    for (const { m, from, leadId, contactId } of fresh) {
      const headers = m.payload?.headers;
      const subject = headerValue(headers, "Subject");
      const received = m.internalDate
        ? new Date(Number(m.internalDate)).toISOString()
        : new Date().toISOString();

      // Owner lookup for handled_by.
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("owner_id")
        .eq("id", leadId)
        .maybeSingle();
      const ownerId = (lead?.owner_id as string | null) ?? null;

      // Minimal ledger row — used only for dedupe + realtime notifier.
      await supabaseAdmin.from("inbox_messages").insert({
        gmail_message_id: m.id,
        gmail_thread_id: m.threadId,
        from_email: from.email,
        from_name: from.name,
        to_email: INBOX_ADDR,
        subject: subject ?? null,
        snippet: m.snippet ?? null,
        received_at: received,
        is_unread: (m.labelIds ?? []).includes("UNREAD"),
        label_ids: m.labelIds ?? [],
        lead_id: leadId,
        lead_contact_id: contactId,
        handled_by: ownerId,
        notified: true,
      });

      await supabaseAdmin.from("lead_activities").insert({
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

      await supabaseAdmin
        .from("leads")
        .update({ last_activity_at: received })
        .eq("id", leadId);

      newLinked += 1;
    }

    return { synced: messages.length, newLinked };
  });

// ---------------------------------------------------------------------------
// listInbox: fetches directly from Gmail (no DB reads for message data).
// Cross-references from_emails against lead_contacts in one query to
// annotate lead linkage.
// ---------------------------------------------------------------------------
export const listInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        filter: z.enum(["all", "unread", "mine", "linked", "unlinked"]).default("all"),
        limit: z.number().min(1).max(200).default(100),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<InboxRow[]> => {
    const messages = await fetchInboxGmail(data.limit);
    if (messages.length === 0) return [];

    // Build lead-link map from lead_contacts (single query).
    const fromEmails = Array.from(
      new Set(
        messages
          .map((m) => parseAddress(headerValue(m.payload?.headers, "From")).email)
          .filter(Boolean),
      ),
    );
    const linkByEmail = new Map<string, { leadId: string; contactId: string }>();
    if (fromEmails.length > 0) {
      const { data: contacts } = await context.supabase
        .from("lead_contacts")
        .select("id, lead_id, email, alt_email");
      for (const c of contacts ?? []) {
        const emails = [c.email as string | null, c.alt_email as string | null]
          .filter(Boolean)
          .map((x) => (x as string).toLowerCase());
        for (const e of emails) {
          if (fromEmails.includes(e) && !linkByEmail.has(e))
            linkByEmail.set(e, {
              leadId: c.lead_id as string,
              contactId: c.id as string,
            });
        }
      }
    }

    const linkedLeadIds = Array.from(new Set(Array.from(linkByEmail.values()).map((v) => v.leadId)));
    const leadMeta = new Map<
      string,
      { slug: string | null; name: string | null; owner_id: string | null }
    >();
    if (linkedLeadIds.length > 0) {
      const { data: leads } = await context.supabase
        .from("leads")
        .select("id, slug, lead_code, name, owner_id")
        .in("id", linkedLeadIds);
      for (const l of leads ?? [])
        leadMeta.set(l.id as string, {
          slug: (l.slug as string) ?? (l.lead_code as string) ?? null,
          name: (l.name as string) ?? null,
          owner_id: (l.owner_id as string | null) ?? null,
        });
    }
    const ownerIds = Array.from(
      new Set(Array.from(leadMeta.values()).map((v) => v.owner_id).filter(Boolean)),
    ) as string[];
    const ownerNames = new Map<string, string | null>();
    if (ownerIds.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ownerIds);
      for (const p of profs ?? [])
        ownerNames.set(p.user_id as string, (p.full_name as string) ?? null);
    }

    const rows: InboxRow[] = messages.map((m) => {
      const headers = m.payload?.headers;
      const from = parseAddress(headerValue(headers, "From"));
      const to = parseAddress(headerValue(headers, "To"));
      const link = linkByEmail.get(from.email) ?? null;
      const meta = link ? leadMeta.get(link.leadId) ?? null : null;
      return {
        gmail_message_id: m.id,
        gmail_thread_id: m.threadId,
        from_email: from.email,
        from_name: from.name,
        to_email: to.email || INBOX_ADDR,
        subject: headerValue(headers, "Subject"),
        snippet: m.snippet ?? null,
        received_at: m.internalDate
          ? new Date(Number(m.internalDate)).toISOString()
          : new Date().toISOString(),
        is_unread: (m.labelIds ?? []).includes("UNREAD"),
        label_ids: m.labelIds ?? [],
        lead_id: link?.leadId ?? null,
        lead_contact_id: link?.contactId ?? null,
        handled_by: meta?.owner_id ?? null,
        handled_by_name: meta?.owner_id ? ownerNames.get(meta.owner_id) ?? null : null,
        lead_slug: meta?.slug ?? null,
        lead_name: meta?.name ?? null,
      };
    });

    // Apply filter client-side (already fetched from Gmail).
    let filtered = rows;
    if (data.filter === "unread") filtered = rows.filter((r) => r.is_unread);
    else if (data.filter === "mine") filtered = rows.filter((r) => r.handled_by === context.userId);
    else if (data.filter === "linked") filtered = rows.filter((r) => r.lead_id !== null);
    else if (data.filter === "unlinked") filtered = rows.filter((r) => r.lead_id === null);
    return filtered;
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
  contentAvailable: boolean;
  warning: string | null;
}

/** Full-format fetch of a Gmail thread. */
export const getInboxThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ threadId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }): Promise<InboxThread> => {
    const thread = await callGateway<{ id: string; messages?: GmailMessage[] }>({
      connector: "google_mail",
      path: `/gmail/v1/users/me/threads/${encodeURIComponent(data.threadId)}`,
      query: { format: "full" },
    }).catch(async (error) => {
      // Fallback if the token is still metadata-scoped.
      if (
        error instanceof Error &&
        /metadata scope.*format full|format full.*metadata scope/i.test(error.message)
      ) {
        return callGateway<{ id: string; messages?: GmailMessage[] }>({
          connector: "google_mail",
          path: `/gmail/v1/users/me/threads/${encodeURIComponent(data.threadId)}`,
          query: { format: "metadata", metadataHeaders: THREAD_METADATA_HEADERS },
        });
      }
      throw error;
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

    // Live lead lookup from the first message's from_email — no DB cache read.
    let lead_id: string | null = null;
    let lead_slug: string | null = null;
    let lead_name: string | null = null;
    const firstFrom = messages[0]?.from_email;
    if (firstFrom) {
      const { data: contact } = await context.supabase
        .from("lead_contacts")
        .select("lead_id")
        .or(`email.eq.${firstFrom},alt_email.eq.${firstFrom}`)
        .limit(1)
        .maybeSingle();
      if (contact?.lead_id) {
        lead_id = contact.lead_id as string;
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
      contentAvailable: true,
      warning: null,
    };
  });

/** Mark an entire Gmail thread as read directly in Gmail (no DB write). */
export const markThreadRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ threadId: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    // Fetch message IDs for the thread from Gmail.
    const thread = await callGateway<{ messages?: Array<{ id: string }> }>({
      connector: "google_mail",
      path: `/gmail/v1/users/me/threads/${encodeURIComponent(data.threadId)}`,
      query: { format: "minimal" },
    }).catch(() => ({ messages: [] as Array<{ id: string }> }));
    const ids = (thread.messages ?? []).map((m) => m.id);
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
    return { ok: true };
  });
