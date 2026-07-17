// Server-only helpers for Brevo webhook events for LEAD emails.
// Stored in a dedicated Google Sheet (parallel to Resend events) so DB stays free
// of high-volume delivery telemetry. Employee welcome mail events keep using
// public.email_events via the existing brevo.webhook.ts path.
import { callGateway } from "@/lib/connector-gateway.server";

const SHEET_TITLE = "Branta Tech · Brevo Email Events";
const SHEET_TAB = "Events";
export const BREVO_EVENT_HEADERS = [
  "timestamp",
  "event_type",
  "email_id",
  "lead_email_id",
  "lead_id",
  "lead_slug",
  "recipient",
  "subject",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

async function getSheetId(admin: Admin): Promise<string | null> {
  const { data } = await admin
    .from("integration_sync_state")
    .select("resource_id")
    .eq("kind", "brevo_events_sheet")
    .maybeSingle();
  return data?.resource_id ?? null;
}

async function saveSheetId(admin: Admin, id: string) {
  await admin.from("integration_sync_state").upsert(
    {
      kind: "brevo_events_sheet",
      resource_id: id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "kind" },
  );
}

export async function ensureBrevoEventsSheet(admin: Admin): Promise<string> {
  const existing = await getSheetId(admin);
  if (existing) return existing;
  const created = await callGateway<{ spreadsheetId: string }>({
    connector: "google_sheets",
    path: "/v4/spreadsheets",
    method: "POST",
    body: {
      properties: { title: SHEET_TITLE },
      sheets: [{ properties: { title: SHEET_TAB } }],
    },
  });
  const lastCol = String.fromCharCode(64 + BREVO_EVENT_HEADERS.length);
  await callGateway({
    connector: "google_sheets",
    path: `/v4/spreadsheets/${created.spreadsheetId}/values/${SHEET_TAB}!A1:${lastCol}1`,
    method: "PUT",
    query: { valueInputOption: "RAW" },
    body: { values: [BREVO_EVENT_HEADERS] },
  });
  await saveSheetId(admin, created.spreadsheetId);
  return created.spreadsheetId;
}

export interface BrevoEventRow {
  timestamp: string;
  event_type: string;
  email_id: string;
  lead_email_id: string;
  lead_id: string;
  lead_slug: string;
  recipient: string;
  subject: string;
}

export async function appendBrevoEvent(
  admin: Admin,
  ev: BrevoEventRow,
): Promise<void> {
  const sheetId = await ensureBrevoEventsSheet(admin);
  await callGateway({
    connector: "google_sheets",
    path: `/v4/spreadsheets/${sheetId}/values/${SHEET_TAB}!A:H:append`,
    method: "POST",
    query: { valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" },
    body: {
      values: [
        BREVO_EVENT_HEADERS.map(
          (h) => (ev as unknown as Record<string, string>)[h] ?? "",
        ),
      ],
    },
  });
}

export async function readAllBrevoEvents(admin: Admin): Promise<BrevoEventRow[]> {
  const sheetId = await getSheetId(admin);
  if (!sheetId) return [];
  const res = await callGateway<{ values?: string[][] }>({
    connector: "google_sheets",
    path: `/v4/spreadsheets/${sheetId}/values/${SHEET_TAB}!A2:H100000`,
    method: "GET",
  });
  const rows = res.values ?? [];
  return rows
    .filter((r) => r.length > 0)
    .map((r) => {
      const obj: Record<string, string> = {};
      BREVO_EVENT_HEADERS.forEach((h, i) => (obj[h] = r[i] ?? ""));
      return obj as unknown as BrevoEventRow;
    });
}

/**
 * Canonicalise Brevo event names to the same vocabulary used by the Resend
 * status chip so the UI shows a single consistent set of states.
 */
export function canonicalBrevoEvent(raw: string): string {
  const v = raw.toLowerCase().replace(/\s+/g, "_");
  const MAP: Record<string, string> = {
    request: "sent",
    delivered: "delivered",
    opened: "opened",
    first_opened: "opened",
    unique_opened: "opened",
    proxy_open: "opened",
    click: "clicked",
    clicked: "clicked",
    hard_bounce: "bounced",
    hardbounce: "bounced",
    invalid_email: "bounced",
    invalid: "bounced",
    soft_bounce: "delivery_delayed",
    softbounce: "delivery_delayed",
    deferred: "delivery_delayed",
    blocked: "suppressed",
    spam: "complained",
    complaint: "complained",
    unsubscribed: "unsubscribed",
    unsubscribe: "unsubscribed",
    error: "failed",
  };
  return MAP[v] ?? v;
}
