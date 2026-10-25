import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ExpenseLinkResult =
  | { status: "ok"; expense: PublicExpenseView }
  | { status: "forbidden" }
  | { status: "not_found" };

export interface PublicExpenseView {
  voucher_no: string | null;
  category: string;
  amount: number;
  currency: string;
  spent_on: string;
  vendor: string | null;
  department: string | null;
  payment_method: string | null;
  txn_id: string | null;
  request_purpose: string | null;
  notes: string | null;
  invoice_slug: string | null;
  invoice_title: string | null;
  is_project_cost: boolean;
  requested_by_name: string | null;
  paid_by_name: string | null;
  items: Array<{
    name: string; quantity: number; unit: string | null;
    unit_price: number; amount: number; note: string | null;
  }>;
  receipts: Array<{ caption: string | null; url: string; is_pdf: boolean }>;
}

/**
 * Private expense voucher link: requires a signed-in session AND the Finance
 * role (checked server-side via is_finance_admin). No token grants access.
 */
export const getExpenseByLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { voucher: string }) =>
    z.object({ voucher: z.string().min(1).max(60) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<ExpenseLinkResult> => {
    const { data: ok, error: roleErr } = await context.supabase.rpc("is_finance_admin" as never, { _user_id: context.userId } as never);
    if (roleErr || !ok) return { status: "forbidden" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: exp } = await supabaseAdmin
      .from("expenses")
      .select("*")
      .eq("voucher_no", data.voucher)
      .is("deleted_at", null)
      .maybeSingle();
    const e = exp as Record<string, unknown> | null;
    if (!e) return { status: "not_found" };

    const uids = [e["requested_by"], e["paid_by"]].filter(Boolean) as string[];
    const [{ data: items }, { data: atts }, { data: profs }, inv] = await Promise.all([
      supabaseAdmin.from("expense_items").select("*").eq("expense_id", e["id"] as string).order("sequence"),
      supabaseAdmin.from("expense_attachments").select("*").eq("expense_id", e["id"] as string).order("sequence"),
      uids.length
        ? supabaseAdmin.from("profiles").select("user_id, full_name").in("user_id", uids)
        : Promise.resolve({ data: [] as { user_id: string; full_name: string | null }[] }),
      e["linked_invoice_id"]
        ? supabaseAdmin.from("invoices").select("slug, title").eq("id", e["linked_invoice_id"] as string).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const nameOf = (id: unknown) =>
      (typeof id === "string" &&
        ((profs ?? []) as { user_id: string; full_name: string | null }[]).find((p) => p.user_id === id)
          ?.full_name) || null;

    const receipts: PublicExpenseView["receipts"] = [];
    for (const a of ((atts ?? []) as { path: string; caption: string | null }[]).slice(0, 20)) {
      const { data: signed } = await supabaseAdmin.storage
        .from("expense-receipts")
        .createSignedUrl(a.path, 60 * 30);
      if (signed) receipts.push({ caption: a.caption, url: signed.signedUrl, is_pdf: /\.pdf$/i.test(a.path) });
    }

    const invRow = (inv as { data?: { slug: string; title: string } | null } | null)?.data ?? null;

    return { status: "ok", expense: {
      voucher_no: (e["voucher_no"] as string) ?? null,
      category: e["category"] as string,
      amount: Number(e["amount"]),
      currency: e["currency"] as string,
      spent_on: e["spent_on"] as string,
      vendor: (e["vendor"] as string) ?? null,
      department: (e["department"] as string) ?? null,
      payment_method: (e["payment_method"] as string) ?? null,
      txn_id: (e["txn_id"] as string) ?? null,
      request_purpose: (e["request_purpose"] as string) ?? null,
      notes: (e["notes"] as string) ?? null,
      invoice_slug: invRow?.slug ?? null,
      invoice_title: invRow?.title ?? null,
      is_project_cost: e["is_project_cost"] === true,
      requested_by_name: nameOf(e["requested_by"]),
      paid_by_name: nameOf(e["paid_by"]),
      items: ((items ?? []) as PublicExpenseView["items"]).map((i) => ({
        name: i.name,
        quantity: Number(i.quantity),
        unit: i.unit ?? null,
        unit_price: Number(i.unit_price),
        amount: Number(i.amount),
        note: i.note ?? null,
      })),
      receipts,
    } };
  });
