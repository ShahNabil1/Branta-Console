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

/** Signed URL for an expense voucher PDF (namespaced so slugs can't collide). */
export function buildSignedExpenseVoucherUrl(
  baseUrl: string,
  voucherNo: string,
  ttlSeconds = 60 * 60 * 24 * 30,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = signInvoiceSlug(`exp:${voucherNo}`, exp);
  return `${baseUrl}/api/public/expenses/${encodeURIComponent(voucherNo)}.pdf?exp=${exp}&sig=${sig}`;
}

export function verifyExpenseVoucherSig(voucherNo: string, exp: number, sig: string): boolean {
  return verifyInvoiceSlug(`exp:${voucherNo}`, exp, sig);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadExpenseVoucherPayload(adminClient: any, voucherNo: string) {
  const { data: exp, error } = await adminClient
    .from("expenses").select("*").eq("voucher_no", voucherNo).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  if (!exp) return null;
  const uids = [exp.created_by, exp.paid_by, exp.requested_by].filter(Boolean) as string[];
  const [{ data: profs }, { data: settings }, inv, { data: items }, { data: atts }] = await Promise.all([
    uids.length
      ? adminClient.from("profiles").select("user_id, full_name").in("user_id", uids)
      : Promise.resolve({ data: [] }),
    adminClient.from("invoice_pdf_settings").select("*").eq("id", "default").maybeSingle(),
    exp.linked_invoice_id
      ? adminClient.from("invoices").select("slug").eq("id", exp.linked_invoice_id).maybeSingle()
      : Promise.resolve({ data: null }),
    adminClient.from("expense_items").select("*").eq("expense_id", exp.id).order("sequence"),
    adminClient.from("expense_attachments").select("*").eq("expense_id", exp.id).order("sequence"),
  ]);
  const nameOf = (id: string | null) =>
    (id && (profs ?? []).find((p: { user_id: string }) => p.user_id === id)?.full_name) || null;

  // Embed up to 8 image proofs directly into the voucher PDF.
  const attachments: Array<{ caption: string | null; name: string; isPdf: boolean; bytes?: Uint8Array; kind: "png" | "jpg" | null }> = [];
  for (const a of ((atts ?? []) as { path: string; caption: string | null }[]).slice(0, 12)) {
    const name = a.path.split("/").pop() ?? "receipt";
    const isPdf = /\.pdf$/i.test(a.path);
    const kind = /\.png$/i.test(a.path) ? "png" : /\.(jpe?g)$/i.test(a.path) ? "jpg" : null;
    let bytes: Uint8Array | undefined;
    if (kind && attachments.filter((x) => x.bytes).length < 8) {
      try {
        const { data: file } = await adminClient.storage.from("expense-receipts").download(a.path);
        if (file) bytes = new Uint8Array(await file.arrayBuffer());
      } catch { /* keep the caption even if the file can't be read */ }
    }
    attachments.push({ caption: a.caption, name, isPdf, bytes, kind });
  }

  return {
    expense: exp,
    items: items ?? [],
    attachments,
    preparedByName: nameOf(exp.created_by),
    paidToName: nameOf(exp.paid_by),
    requestedByName: nameOf(exp.requested_by ?? null),
    linkedInvoiceSlug: inv?.data?.slug ?? null,
    settings: settings ?? null,
  };
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadInvoicePdfPayload(adminClient: any, slug: string) {
  const { data: inv, error } = await adminClient
    .from("invoices").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!inv) return null;
  const [{ data: cust }, { data: insts }, { data: items }, { data: settings }] = await Promise.all([
    adminClient.from("customers")
      .select("name, customer_code, email, company, phone, address, company_id")
      .eq("id", inv.customer_id).maybeSingle(),
    adminClient.from("invoice_installments")
      .select("sequence, label, due_date, amount, status, paid_at")
      .eq("invoice_id", inv.id).order("sequence"),
    adminClient.from("invoice_line_items")
      .select("sequence, description, quantity, unit_price")
      .eq("invoice_id", inv.id).order("sequence"),
    adminClient.from("invoice_pdf_settings").select("*").eq("id", "default").maybeSingle(),
  ]);
  let invoiceSettings = inv.pdf_template_snapshot ?? settings ?? null;
  // Legacy holding invoices keep their previous settings; a sister never inherits holding identity.
  if (!inv.pdf_template_snapshot && cust?.company_id) {
    const { data: co, error: coError } = await adminClient.from("companies").select("is_holding").eq("id", cust.company_id).single();
    if (coError) throw new Error("Unable to resolve invoice company.");
    if (!co.is_holding) {
      const { companyInvoiceSettings } = await import("./company-invoice-template.server");
      invoiceSettings = (await companyInvoiceSettings(adminClient, cust.company_id)).settings;
    }
  }
  // Sister companies: fill missing logos and apply admin-chosen PDF colour overrides.
  if (cust?.company_id && invoiceSettings) {
    const { data: co } = await adminClient.from("companies").select("is_holding, logo_url, brand_kit").eq("id", cust.company_id).maybeSingle();
    if (co && !co.is_holding) {
      const bk = (co.brand_kit ?? {}) as { logo_primary?: string; logo_inverse?: string; pdf_colors?: Record<string, string> };
      const next = { ...invoiceSettings } as Record<string, unknown>;
      if (!next.logo_url) next.logo_url = bk.logo_primary || co.logo_url || null;
      if (!next.logo_inverse_url) next.logo_inverse_url = bk.logo_inverse || null;
      for (const [k, v] of Object.entries(bk.pdf_colors ?? {})) {
        if (["text_color", "muted_color", "hairline_color", "panel_bg_color", "brand_color"].includes(k) && /^#[0-9A-F]{6}$/i.test(v)) next[k] = v;
      }
      invoiceSettings = next;
    }
  }
  return {
    invoice: inv,
    customer: cust ?? { name: null, customer_code: null, email: null, company: null, phone: null, address: null },
    installments: insts ?? [],
    lineItems: items ?? [],
    settings: invoiceSettings,
  };
}


/* ================= Salary slips ================= */

/** Signed URL for a salary slip PDF (namespaced so slugs can't collide). */
export function buildSignedSalarySlipUrl(
  baseUrl: string,
  slipNo: string,
  ttlSeconds = 60 * 60 * 24 * 30,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = signInvoiceSlug(`sal:${slipNo}`, exp);
  return `${baseUrl}/api/public/salary/${encodeURIComponent(slipNo)}.pdf?exp=${exp}&sig=${sig}`;
}

export function verifySalarySlipSig(slipNo: string, exp: number, sig: string): boolean {
  return verifyInvoiceSlug(`sal:${slipNo}`, exp, sig);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadSalarySlipPayload(adminClient: any, slipNo: string) {
  const { data: slip, error } = await adminClient
    .from("salary_slips").select("*").eq("slip_no", slipNo).maybeSingle();
  if (error) throw new Error(error.message);
  // A valid old signature must not bypass finance's revocation.
  if (!slip || slip.status === "void") return null;
  const uids = [slip.user_id, slip.created_by].filter(Boolean) as string[];
  const [{ data: profs }, { data: settings }] = await Promise.all([
    adminClient.from("profiles")
      .select("user_id, full_name, employee_code, job_role, bank_name, bank_account_number, mfs_provider, mfs_number")
      .in("user_id", uids),
    adminClient.from("invoice_pdf_settings").select("*").eq("id", "default").maybeSingle(),
  ]);
  const list = (profs ?? []) as Array<{ user_id: string; full_name: string | null; employee_code: string | null; job_role: string | null }>;
  const employee = list.find((p) => p.user_id === slip.user_id) ?? null;
  const preparedBy = list.find((p) => p.user_id === slip.created_by) ?? null;
  return {
    slip,
    employeeName: employee?.full_name ?? null,
    employeeCode: employee?.employee_code ?? null,
    employeeRole: employee?.job_role ?? null,
    preparedByName: preparedBy?.full_name ?? null,
    settings: settings ?? null,
  };
}


/* ================= Income vouchers ================= */

/** Signed URL for an income (money receipt) voucher PDF. */
export function buildSignedIncomeVoucherUrl(
  baseUrl: string,
  voucherNo: string,
  ttlSeconds = 60 * 60 * 24 * 30,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = signInvoiceSlug(`inc:${voucherNo}`, exp);
  return `${baseUrl}/api/public/income/${encodeURIComponent(voucherNo)}.pdf?exp=${exp}&sig=${sig}`;
}

export function verifyIncomeVoucherSig(voucherNo: string, exp: number, sig: string): boolean {
  return verifyInvoiceSlug(`inc:${voucherNo}`, exp, sig);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadIncomeVoucherPayload(adminClient: any, voucherNo: string) {
  const { data: v, error } = await adminClient
    .from("income_vouchers").select("*").eq("voucher_no", voucherNo).maybeSingle();
  if (error) throw new Error(error.message);
  if (!v) return null;
  const uids = [v.created_by].filter(Boolean) as string[];
  const [{ data: profs }, { data: settings }, inv] = await Promise.all([
    uids.length
      ? adminClient.from("profiles").select("user_id, full_name").in("user_id", uids)
      : Promise.resolve({ data: [] }),
    adminClient.from("invoice_pdf_settings").select("*").eq("id", "default").maybeSingle(),
    v.invoice_id
      ? adminClient.from("invoices").select("slug").eq("id", v.invoice_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const nameOf = (id: string | null) =>
    (id && (profs ?? []).find((p: { user_id: string }) => p.user_id === id)?.full_name) || null;
  return {
    voucher: v,
    preparedByName: nameOf(v.created_by),
    linkedInvoiceSlug: inv?.data?.slug ?? null,
    settings: settings ?? null,
  };
}
