// Server-only helpers for invoice PDF signing and data hydration.
import { createHmac, timingSafeEqual } from "node:crypto";

export function signInvoiceSlug(slug: string, exp: number): string {
  const secret = process.env.INVOICE_PDF_SIGNING_SECRET;
  if (!secret) throw new Error("INVOICE_PDF_SIGNING_SECRET not set");
  return createHmac("sha256", secret).update(`${slug}.${exp}`).digest("hex");
}

export function verifyInvoiceSlug(slug: string, exp: number, sig: string): boolean {
  try {
    const expected = signInvoiceSlug(slug, exp);
    if (expected.length !== sig.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

/** Build a public signed PDF URL. Expires in `ttlSeconds` (default 30d). */
export function buildSignedInvoiceUrl(baseUrl: string, slug: string, ttlSeconds = 60 * 60 * 24 * 30): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = signInvoiceSlug(slug, exp);
  return `${baseUrl}/api/public/invoices/${encodeURIComponent(slug)}.pdf?exp=${exp}&sig=${sig}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadInvoicePdfPayload(adminClient: any, slug: string) {
  const { data: inv, error } = await adminClient
    .from("invoices").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!inv) return null;
  const [{ data: cust }, { data: insts }, { data: settings }] = await Promise.all([
    adminClient.from("customers")
      .select("name, customer_code, email, company, phone")
      .eq("id", inv.customer_id).maybeSingle(),
    adminClient.from("invoice_installments")
      .select("sequence, label, due_date, amount, status, paid_at")
      .eq("invoice_id", inv.id).order("sequence"),
    adminClient.from("invoice_pdf_settings").select("*").eq("id", "default").maybeSingle(),
  ]);
  return {
    invoice: inv,
    customer: cust ?? { name: null, customer_code: null, email: null, company: null, phone: null },
    installments: insts ?? [],
    settings: settings ?? null,
  };
}
