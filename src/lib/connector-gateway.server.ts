// Server-only helper for Lovable connector-gateway calls.
// Never import from browser code.

const BASE = "https://connector-gateway.lovable.dev";

export type ConnectorId =
  | "resend"
  | "brevo"
  | "google_mail"
  | "google_calendar"
  | "google_docs"
  | "google_sheets"
  | "telegram";

const KEY_ENV: Record<ConnectorId, string> = {
  resend: "RESEND_API_KEY",
  brevo: "BREVO_API_KEY",
  google_mail: "GOOGLE_MAIL_API_KEY",
  google_calendar: "GOOGLE_CALENDAR_API_KEY",
  google_docs: "GOOGLE_DOCS_API_KEY",
  google_sheets: "GOOGLE_SHEETS_API_KEY",
  telegram: "TELEGRAM_API_KEY",
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
  /** Use this company's own connected Google account (Gmail/Calendar) when one exists. */
  companyId?: string | null;
}

// Direct API mode: when the provider's own credentials are stored as project
// secrets, call the provider directly so workspace transfers never break
// integrations. Falls back to the connector gateway otherwise.
const GOOGLE_BASE: Partial<Record<ConnectorId, string>> = {
  google_mail: "https://gmail.googleapis.com",
  google_calendar: "https://www.googleapis.com",
  google_docs: "https://docs.googleapis.com",
  google_sheets: "https://sheets.googleapis.com",
};

let googleToken: { token: string; exp: number } | null = null;
async function getGoogleAccessToken(): Promise<string | null> {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refresh = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!id || !secret || !refresh) return null;
  if (googleToken && googleToken.exp > Date.now() + 60_000) return googleToken.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google token refresh ${res.status}: ${text.slice(0, 300)}`);
  const j = JSON.parse(text) as { access_token: string; expires_in: number };
  googleToken = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

async function resolveTarget(
  connector: ConnectorId,
  path: string,
  companyId?: string | null,
): Promise<{ base: string; auth: Record<string, string> }> {
  if (companyId && (connector === "google_mail" || connector === "google_calendar")) {
    const { companyGoogleToken } = await import("@/lib/company-google.server");
    const t = await companyGoogleToken(companyId);
    if (t) return { base: GOOGLE_BASE[connector]!, auth: { Authorization: `Bearer ${t}` } };
  }
  if (connector === "telegram" && process.env.TELEGRAM_BOT_TOKEN) {
    return { base: `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`, auth: {} };
  }
  if (connector === "resend" && process.env.RESEND_DIRECT_API_KEY) {
    return {
      base: "https://api.resend.com",
      auth: { Authorization: `Bearer ${process.env.RESEND_DIRECT_API_KEY}` },
    };
  }
  if (connector === "brevo" && process.env.BREVO_DIRECT_API_KEY) {
    return {
      base: path.startsWith("/v3/") ? "https://api.brevo.com" : "https://api.brevo.com/v3",
      auth: { "api-key": process.env.BREVO_DIRECT_API_KEY },
    };
  }
  const gBase = GOOGLE_BASE[connector];
  if (gBase) {
    const token = await getGoogleAccessToken();
    if (token) return { base: gBase, auth: { Authorization: `Bearer ${token}` } };
  }
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  const connKey = process.env[KEY_ENV[connector]];
  if (!connKey) throw new Error(`${KEY_ENV[connector]} is not configured`);
  return {
    base: `${BASE}/${connector}`,
    auth: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey },
  };
}

export async function callGateway<T = unknown>(
  opts: GatewayCallOptions,
): Promise<T> {
  const target = await resolveTarget(opts.connector, opts.path, opts.companyId);
  const url = new URL(`${target.base}${opts.path}`);
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
    ...target.auth,
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
