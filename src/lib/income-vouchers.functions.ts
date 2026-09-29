// Income (money receipt) vouchers: create a numbered, printable receipt for a
// received payment, upload the signed & sealed copy back, and alert the
// Accounts manager / finance team on Telegram.
import { dbError } from "@/lib/db-errors";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface IncomeVoucherRow {
  id: string;
  voucher_no: string | null;
  source: "installment" | "ledger";
  source_id: string;
  invoice_id: string | null;
  customer_id: string | null;
  party: string | null;
  project: string | null;
  category: string;
  currency: "BDT" | "USD";
  amount: number;
  received_on: string;
  payment_method: string | null;
  txn_id: string | null;
  notes: string | null;
  signed_voucher_url: string | null;
  signed_voucher_at: string | null;
  created_at: string;
}

async function ensureFinance(
  supabase: { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> },
  userId: string,
) {
  const { data, error } = await supabase.rpc("is_finance_admin", { _user_id: userId });
  if (error) throw dbError(error);
  if (!data) throw new Error("Forbidden — finance access required");
}

const CreateIn = z.object({
  source: z.enum(["installment", "ledger"]),
  source_id: z.string().uuid(),
  invoice_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  party: z.string().trim().max(200).nullable().optional(),
  project: z.string().trim().max(200).nullable().optional(),
  category: z.string().trim().max(80).default("Invoice payment"),
  currency: z.enum(["BDT", "USD"]).default("BDT"),
  amount: z.number(),
  received_on: z.string(),
  payment_method: z.string().trim().max(80).nullable().optional(),
  txn_id: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(600).nullable().optional(),
});

/** All vouchers for a set of income rows (source ids), for the report table. */
export const listIncomeVouchers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IncomeVoucherRow[]> => {
    await ensureFinance(context.supabase as never, context.userId);
    const { data, error } = await context.supabase
      .from("income_vouchers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw dbError(error);
    return (data ?? []) as unknown as IncomeVoucherRow[];
  });

/** Create (or return the existing) money receipt for an income transaction. */
export const createIncomeVoucher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateIn.parse(d))
  .handler(async ({ data, context }): Promise<IncomeVoucherRow> => {
    await ensureFinance(context.supabase as never, context.userId);

    const { data: existing } = await context.supabase
      .from("income_vouchers")
      .select("*")
      .eq("source", data.source)
      .eq("source_id", data.source_id)
      .maybeSingle();
    if (existing) return existing as unknown as IncomeVoucherRow;

    const { data: created, error } = await context.supabase
      .from("income_vouchers")
      .insert({
        source: data.source,
        source_id: data.source_id,
        invoice_id: data.invoice_id ?? null,
        customer_id: data.customer_id ?? null,
        party: data.party ?? null,
        project: data.project ?? null,
        category: data.category,
        currency: data.currency,
        amount: Math.abs(Number(data.amount)),
        received_on: data.received_on,
        payment_method: data.payment_method ?? null,
        txn_id: data.txn_id ?? null,
        notes: data.notes ?? null,
        created_by: context.userId,
      } as never)
      .select("*")
      .single();
    if (error) throw dbError(error);
    const row = created as unknown as IncomeVoucherRow;

    try {
      const { notify } = await import("@/lib/notify.server");
      const sym = row.currency === "BDT" ? "৳ " : "$ ";
      await notify({
        event: "income.voucher.created",
        recipientRoles: ["finance", "admin", "super_admin"],
        vars: {
          voucher: row.voucher_no ?? "Money receipt",
          amount: `${sym}${Number(row.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
          party: row.party ?? "—",
          date: row.received_on,
        },
        dedupeKey: `income-voucher:${row.id}:created`,
        actorId: context.userId,
      });
    } catch (e) {
      console.error("[createIncomeVoucher] notify failed:", e);
    }

    return row;
  });

/** Signed public URL of the generated money-receipt PDF. */
export const getSignedIncomeVoucherUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), mode: z.enum(["digital", "print"]).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinance(context.supabase as never, context.userId);
    const { data: row } = await context.supabase
      .from("income_vouchers").select("voucher_no").eq("id", data.id).maybeSingle();
    const voucherNo = (row as { voucher_no: string | null } | null)?.voucher_no;
    if (!voucherNo) throw new Error("Receipt number not assigned yet");
    const { getRequestOrigin } = await import("@/lib/invoice-request-origin.server");
    const { buildSignedIncomeVoucherUrl } = await import("@/lib/invoice-pdf-signing.server");
    let origin = await getRequestOrigin();
    if (!origin) origin = process.env["PUBLIC_BASE_URL"] || "https://console.brantatech.com";
    const base = buildSignedIncomeVoucherUrl(origin, voucherNo);
    return { url: data.mode === "print" ? `${base}&mode=print` : base, voucher_no: voucherNo };
  });

/** Attach (or detach) the printed, signed & sealed copy — notifies Accounts. */
export const setIncomeVoucherSigned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), path: z.string().max(600).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinance(context.supabase as never, context.userId);
    const { error } = await context.supabase
      .from("income_vouchers")
      .update({
        signed_voucher_url: data.path,
        signed_voucher_at: data.path ? new Date().toISOString() : null,
        signed_voucher_by: data.path ? context.userId : null,
      } as never)
      .eq("id", data.id);
    if (error) throw dbError(error);

    if (data.path) {
      try {
        const { data: row } = await context.supabase
          .from("income_vouchers")
          .select("voucher_no, amount, currency, party, received_on")
          .eq("id", data.id)
          .maybeSingle();
        const v = row as {
          voucher_no: string | null; amount: number; currency: string;
          party: string | null; received_on: string;
        } | null;
        const sym = v?.currency === "USD" ? "$ " : "৳ ";
        const { notify } = await import("@/lib/notify.server");
        await notify({
          event: "income.voucher.signed",
          recipientRoles: ["finance", "admin", "super_admin"],
          vars: {
            voucher: v?.voucher_no ?? "Money receipt",
            amount: `${sym}${Number(v?.amount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
            party: v?.party ?? "—",
            date: v?.received_on ?? "",
          },
          dedupeKey: `income-voucher:${data.id}:signed`,
          actorId: context.userId,
        });
      } catch (e) {
        console.error("[setIncomeVoucherSigned] notify failed:", e);
      }
    }
    return { ok: true as const };
  });

/** Signed storage URL of the uploaded sealed copy. */
export const getIncomeVoucherFileUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), download: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureFinance(context.supabase as never, context.userId);
    const { data: row } = await context.supabase
      .from("income_vouchers")
      .select("voucher_no, signed_voucher_url")
      .eq("id", data.id)
      .maybeSingle();
    const v = row as { voucher_no: string | null; signed_voucher_url: string | null } | null;
    if (!v?.signed_voucher_url) throw new Error("No sealed copy uploaded for this receipt");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ext = v.signed_voucher_url.split(".").pop() ?? "pdf";
    const { data: signed, error } = await supabaseAdmin.storage
      .from("expense-receipts")
      .createSignedUrl(
        v.signed_voucher_url,
        300,
        data.download ? { download: `Receipt-${v.voucher_no ?? "income"}-signed.${ext}` } : undefined,
      );
    if (error) throw dbError(error);
    return { url: signed.signedUrl, path: v.signed_voucher_url };
  });
