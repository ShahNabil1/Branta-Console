// Server-only helper for Lovable connector-gateway calls.
// Never import from browser code.

const BASE = "https://connector-gateway.lovable.dev";

export type ConnectorId =
  | "resend"
  | "brevo"
  | "google_mail"
  | "google_calendar"
  | "google_docs"
  | "google_sheets";

const KEY_ENV: Record<ConnectorId, string> = {
  resend: "RESEND_API_KEY",
  brevo: "BREVO_API_KEY",
  google_mail: "GOOGLE_MAIL_API_KEY",
  google_calendar: "GOOGLE_CALENDAR_API_KEY",
  google_docs: "GOOGLE_DOCS_API_KEY",
  google_sheets: "GOOGLE_SHEETS_API_KEY",
};

export interface GatewayCallOptions {
  connector: ConnectorId;
  path: string; // must start with "/"
  method?: string;
  query?: Record<
    string,
    | string
    | number
    | boolean
    | Array<string | number | boolean>
    | undefined
    | null
  >;
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
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, String(item));
      } else {
        url.searchParams.set(k, String(v));
      }
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

  const method = opts.method ?? (body ? "POST" : "GET");
  let res!: Response;
  let text = "";
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    res = await fetch(url.toString(), { method, headers, body });
    text = await res.text();
    if (res.ok) break;
    const retriable = res.status === 429 || res.status >= 500;
    if (!retriable || attempt === maxAttempts - 1) break;
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(16000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  if (!res.ok) {
    console.error(
      `[gateway] ${opts.connector} ${method} ${opts.path} → ${res.status}: ${text.slice(0, 500)}`,
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
