// Contract helpers shared by browser preview, server PDF and public signing page.
// Pure functions only — no server imports.

export type ContractStatus = "draft" | "awaiting_signature" | "signed" | "expired";
export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "Draft", awaiting_signature: "Awaiting Signature", signed: "Signed", expired: "Expired",
};

export interface ContractForm {
  scope: string; video_length: string; revisions: string; fee: string; special_terms: string; delivery_date: string;
}
export const EMPTY_FORM: ContractForm = { scope: "", video_length: "", revisions: "", fee: "", special_terms: "", delivery_date: "" };

export interface ContractContext {
  company_name: string;
  client_name: string; client_company: string; client_email: string; client_phone: string;
  project_name: string; service: string; project_description: string;
  invoice_no: string; date: string;
}

export const TEMPLATE_FIELDS = [
  "date", "company_name", "client_name", "client_company", "client_company_suffix", "client_email", "client_phone",
  "project_name", "service", "project_description", "scope", "video_length", "revisions", "fee",
  "special_terms", "delivery_date", "invoice_no",
] as const;

/** Replaces {{field}} placeholders; unknown/missing values become "—". */
export function fillTemplate(template: string, ctx: ContractContext, form: ContractForm): string {
  const values: Record<string, string> = {
    ...ctx, ...form,
    client_company_suffix: ctx.client_company ? ` of ${ctx.client_company}` : "",
  };
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => {
    const v = values[k];
    if (k === "client_company_suffix") return v ?? "";
    return v && v.trim() ? v.trim() : "—";
  });
}

/** One project invoice links automatically; with several the team must choose. */
export function autoInvoice<T extends { id: string }>(invoices: T[]): string | null {
  return invoices.length === 1 ? invoices[0].id : null;
}

export function isLinkExpired(expiresAt: string | Date, now: Date = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

export const OTP_MAX_ATTEMPTS = 5;
export const OTP_TTL_MS = 10 * 60 * 1000;
/** A code may be tried at most OTP_MAX_ATTEMPTS times and only before it expires. */
export function otpUsable(c: { attempts: number; expires_at: string; verified_at?: string | null }, now: Date = new Date()): boolean {
  return !c.verified_at && c.attempts < OTP_MAX_ATTEMPTS && !isLinkExpired(c.expires_at, now);
}

export function dhakaDate(d: Date = new Date()): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Dhaka" });
}

export interface ContractVersionRow {
  id: string; version: number; published_at: string; published_by: string; published_by_name: string; expires_at: string;
  revoked_at: string | null; signer_email: string; signer_name: string | null; signer_title: string | null; signed_at: string | null;
}
export interface ContractWorkspace {
  ctx: ContractContext; dueOn: string | null; canPublish: boolean;
  settings: { enabled: boolean; template: string; ceoName: string | null; ceoTitle: string | null; hasSignature: boolean; expiryDays: number } | null;
  invoices: { id: string; slug: string; total: number; currency: string; status: string; due: string | null }[];
  autoInvoiceId: string | null;
  contracts: { id: string; title: string; status: ContractStatus; invoiceId: string | null; form: ContractForm; currentVersion: number; updatedAt: string; versions: ContractVersionRow[] }[];
}
