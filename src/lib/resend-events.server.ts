// Server-only helpers for Resend webhook events, stored in a Google Sheet
// (not Supabase) to keep the DB free of high-volume delivery telemetry.
import { callGateway } from "@/lib/connector-gateway.server";

const SHEET_TITLE = "Branta Tech · Email Events";
const SHEET_TAB = "Events";
export const EVENT_HEADERS = [
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
    .eq("kind", "resend_events_sheet")
    .maybeSingle();
  return data?.resource_id ?? null;
}

async function saveSheetId(admin: Admin, id: string) {
  await admin.from("integration_sync_state").upsert(
    {
      kind: "resend_events_sheet",
      resource_id: id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "kind" },
  );
}

export async function ensureEventsSheet(admin: Admin): Promise<string> {
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
  const lastCol = String.fromCharCode(64 + EVENT_HEADERS.length);
  await callGateway({
    connector: "google_sheets",
    path: `/v4/spreadsheets/${created.spreadsheetId}/values/${SHEET_TAB}!A1:${lastCol}1`,
    method: "PUT",
    query: { valueInputOption: "RAW" },
    body: { values: [EVENT_HEADERS] },
  });
  await saveSheetId(admin, created.spreadsheetId);
  return created.spreadsheetId;
}

export interface ResendEventRow {
  timestamp: string;
  event_type: string;
  email_id: string;
  lead_email_id: string;
  lead_id: string;
  lead_slug: string;
  recipient: string;
  subject: string;
}

export async function appendResendEvent(
  admin: Admin,
  ev: ResendEventRow,
): Promise<void> {
  const sheetId = await ensureEventsSheet(admin);
  await callGateway({
    connector: "google_sheets",
    path: `/v4/spreadsheets/${sheetId}/values/${SHEET_TAB}!A:H:append`,
    method: "POST",
    query: { valueInputOption: "RAW", insertDataOption: "INSERT_ROWS" },
    body: {
      values: [
        EVENT_HEADERS.map(
          (h) => (ev as unknown as Record<string, string>)[h] ?? "",
        ),
      ],
    },
  });
}

export async function readAllEvents(admin: Admin): Promise<ResendEventRow[]> {
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
      EVENT_HEADERS.forEach((h, i) => (obj[h] = r[i] ?? ""));
      return obj as unknown as ResendEventRow;
    });
}
