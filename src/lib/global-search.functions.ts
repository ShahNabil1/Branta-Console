// Global search across leads, customers, invoices, employees.
// Called from the Cmd+K command palette. Auth-only; RLS enforced via the
// per-user supabase client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GlobalSearchKind =
  | "lead"
  | "customer"
  | "invoice"
  | "expense"
  | "employee";

export interface GlobalSearchHit {
  kind: GlobalSearchKind;
  id: string;
  title: string;
  subtitle?: string | null;
  code?: string | null;
  to: string;
  /** Optional route params for typed <Link> navigation. */
  params?: Record<string, string>;
  /** Optional search params (e.g. row highlight target). */
  search?: Record<string, string>;
}

const inputSchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(20).optional(),
});

function esc(v: string) {
  // escape %,_ and commas for PostgREST ilike/or filters
  return v.replace(/[,()]/g, " ").replace(/[%_]/g, (m) => `\\${m}`);
}

export const globalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => inputSchema.parse(raw))
  .handler(async ({ data, context }): Promise<GlobalSearchHit[]> => {
    const { supabase } = context;
    const q = data.q;
    const limit = data.limit ?? 8;
    const like = `%${esc(q)}%`;

    const [leadsRes, customersRes, invoicesRes, profilesRes, expensesRes] = await Promise.all([
      supabase
        .from("leads")
        .select("id, slug, lead_code, name, company")
        .or(
          `lead_code.ilike.${like},slug.ilike.${like},name.ilike.${like},company.ilike.${like}`,
        )
        .eq("is_draft", false)
        .limit(limit),
      supabase
        .from("customers")
        .select("id, customer_code, name, company, email")
        .or(
          `customer_code.ilike.${like},name.ilike.${like},company.ilike.${like},email.ilike.${like}`,
        )
        .limit(limit),
      supabase
        .from("invoices")
        .select("id, slug, title, currency, total_amount, customers(name)")
        .or(`slug.ilike.${like},title.ilike.${like}`)
        .limit(limit),
      supabase
        .from("profiles")
        .select("user_id, full_name, employee_code, personal_gmail")
        .or(
          `full_name.ilike.${like},employee_code.ilike.${like},personal_gmail.ilike.${like}`,
        )
        .limit(limit),
      supabase
        .from("expenses")
        .select("id, voucher_no, vendor, txn_id, amount, currency, spent_on")
        .or(`voucher_no.ilike.${like},vendor.ilike.${like},txn_id.ilike.${like}`)
        .limit(limit),
    ]);

    const out: GlobalSearchHit[] = [];

    for (const l of leadsRes.data ?? []) {
      out.push({
        kind: "lead",
        id: l.id,
        title: l.name || l.lead_code,
        subtitle: l.company ?? null,
        code: l.lead_code,
        to: "/app/leads/$slug",
        params: { slug: l.slug },
      });
    }
    for (const c of customersRes.data ?? []) {
      out.push({
        kind: "customer",
        id: c.id,
        title: c.name,
        subtitle: c.company ?? c.email ?? null,
        code: c.customer_code,
        to: "/app/customers/$code",
        params: { code: c.customer_code },
      });
    }
    for (const inv of invoicesRes.data ?? []) {
      const cust = (inv as unknown as { customers: { name: string } | null }).customers;
      out.push({
        kind: "invoice",
        id: inv.id,
        title: inv.title,
        subtitle: cust?.name ?? null,
        code: inv.slug,
        to: "/app/finance/invoices/$slug",
        params: { slug: inv.slug! },
      });
    }
    for (const e of expensesRes.data ?? []) {
      out.push({
        kind: "expense",
        id: e.id,
        title: e.vendor || "Expense",
        subtitle: `${e.currency} ${Number(e.amount).toLocaleString("en-US")} · ${e.spent_on}`,
        code: e.voucher_no,
        to: "/app/finance/expenses",
        search: { highlight: e.id },
      });
    }
    for (const p of profilesRes.data ?? []) {
      out.push({
        kind: "employee",
        id: p.user_id,
        title: p.full_name || p.personal_gmail || "Employee",
        subtitle: p.personal_gmail ?? null,
        code: p.employee_code,
        to: "/app/employees/$userId",
        params: { userId: p.user_id },
      });
    }

    // Rank: exact code match first, then startsWith, then others.
    const needle = q.toLowerCase();
    out.sort((a, b) => {
      const ac = (a.code ?? "").toLowerCase();
      const bc = (b.code ?? "").toLowerCase();
      const score = (h: GlobalSearchHit, c: string) => {
        if (c === needle) return 0;
        if (c.startsWith(needle)) return 1;
        if (h.title.toLowerCase().startsWith(needle)) return 2;
        return 3;
      };
      return score(a, ac) - score(b, bc);
    });

    return out.slice(0, 20);
  });
