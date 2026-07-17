// Server-only helper for Lovable connector-gateway calls.
// Never import from browser code.

const BASE = "https://connector-gateway.lovable.dev";

export type ConnectorId =
  | "resend"
  | "google_mail"
  | "google_calendar"
  | "google_docs"
  | "google_sheets";

const KEY_ENV: Record<ConnectorId, string> = {
  resend: "RESEND_API_KEY",
  google_mail: "GOOGLE_MAIL_API_KEY",
  google_calendar: "GOOGLE_CALENDAR_API_KEY",
  google_docs: "GOOGLE_DOCS_API_KEY",
  google_sheets: "GOOGLE_SHEETS_API_KEY",
};

export interface GatewayCallOptions {
  connector: ConnectorId;
  path: string; // must start with "/"
  method?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function callGateway<T = unknown>(
  opts: GatewayCallOptions,
): Promise<T> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  const connKey = process.env[KEY_ENV[opts.connector]];
  if (!connKey)
    throw new Error(`${KEY_ENV[opts.connector]} is not configured`);

  const url = new URL(`${BASE}/${opts.connector}${opts.path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
    ...(opts.headers ?? {}),
  };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    body =
      typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }

  const res = await fetch(url.toString(), {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(
      `[gateway] ${opts.connector} ${opts.method ?? "GET"} ${opts.path} → ${res.status}: ${text.slice(0, 500)}`,
    );
    throw new Error(
      `${opts.connector} ${res.status}: ${text.slice(0, 300) || res.statusText}`,
    );
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

// Utility: base64url encode a UTF-8 string (Gmail raw messages).
export function base64UrlEncode(s: string): string {
  return Buffer.from(s, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
