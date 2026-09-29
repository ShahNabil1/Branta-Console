// Customers module — manual create + auto-populated from Converted leads.
import { dbError } from "@/lib/db-errors";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface CustomerRow {
  id: string;
  customer_code: string;
  name: string;
  role: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  service: string | null;
  currency: "BDT" | "USD";
  notes: string | null;
  owner_id: string | null;
  converted_from_lead_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  owner_name?: string | null;
  creator_name?: string | null;
  converter_name?: string | null;
  converted_from_lead_slug?: string | null;
}

export interface CustomerPickerItem {
  id: string;
  customer_code: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  currency: "BDT" | "USD";
}


const CreateInput = z.object({
  name: z.string().trim().min(1).max(160),
  role: z.string().trim().max(120).optional().nullable(),
  company: z.string().trim().max(160).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
  source: z.string().trim().max(80).optional().nullable(),
  service: z.string().trim().max(80).optional().nullable(),
  currency: z.enum(["BDT", "USD"]).default("BDT"),
  notes: z.string().trim().max(4000).optional().nullable(),
  owner_id: z.string().uuid().optional().nullable(),
});

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CustomerRow[]> => {
    // Gate: must have customer_access permission.
    const { data: canAccess } = await context.supabase.rpc("has_permission", {
      _user_id: context.userId,
      _perm: "customer_access",
    });
    if (!canAccess) throw new Error("Forbidden: customer_access required");

    const { data: viewAll } = await context.supabase.rpc("has_permission", {
      _user_id: context.userId,
      _perm: "customer_view_all",
    });

    let q = context.supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (!viewAll) {
      q = q.or(`owner_id.eq.${context.userId},created_by.eq.${context.userId}`);
    }
    const { data, error } = await q;
    if (error) throw dbError(error);
    const rows = (data ?? []) as unknown as CustomerRow[];

    // Enrich: owner (converter), creator, lead slug for converted rows.
    const userIds = Array.from(
      new Set(
        rows
          .flatMap((r) => [r.owner_id, r.created_by])
          .filter(Boolean) as string[],
      ),
    );
    const nameByUser = new Map<string, string | null>();
    if (userIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      (profs ?? []).forEach((p: { user_id: string; full_name: string | null }) =>
        nameByUser.set(p.user_id, p.full_name),
      );
    }
    const leadIds = Array.from(
      new Set(rows.map((r) => r.converted_from_lead_id).filter(Boolean) as string[]),
    );
    const slugByLead = new Map<string, string | null>();
    if (leadIds.length) {
      const { data: leads } = await context.supabase
        .from("leads")
        .select("id, slug")
        .in("id", leadIds);
      (leads ?? []).forEach((l: { id: string; slug: string | null }) =>
        slugByLead.set(l.id, l.slug),
      );
    }
    return rows.map((r) => ({
      ...r,
      owner_name: r.owner_id ? nameByUser.get(r.owner_id) ?? null : null,
      creator_name: r.created_by ? nameByUser.get(r.created_by) ?? null : null,
      converter_name: r.owner_id ? nameByUser.get(r.owner_id) ?? null : null,
      converted_from_lead_slug: r.converted_from_lead_id
        ? slugByLead.get(r.converted_from_lead_id) ?? null
        : null,
    }));
  });

/**
 * Minimal customer list for pickers (e.g. invoice creation).
 * Any authenticated user can call this — it deliberately bypasses
 * customer_access so users with invoice access but no customer page
 * access can still select/search customers when creating invoices.
 * Returns only safe display fields.
 */
export const listCustomersForPicker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<CustomerPickerItem[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("customers")
      .select("id, customer_code, name, company, email, phone, currency")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw dbError(error);
    return (data ?? []) as unknown as CustomerPickerItem[];
  });


export const createCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateInput.parse(data))
  .handler(async ({ data, context }): Promise<CustomerRow> => {
    const email = data.email === "" ? null : data.email ?? null;

    // Every customer is backed by a lead so email/meeting/docs/activity all
    // reuse the same LeadDetail pipeline. Insert lead first with default
    // status, add a primary contact if we have one, then flip status to
    // 'converted' — the DB trigger creates the linked customer row.
    const { data: leadRow, error: leadErr } = await context.supabase
      .from("leads")
      .insert({
        name: data.name,
        role: data.role ?? null,
        company: data.company ?? null,
        phone: data.phone ?? null,
        source: data.source ?? null,
        service: data.service ?? null,
        currency: data.currency,
        notes: data.notes ?? null,
        owner_id: data.owner_id ?? context.userId,
        created_by: context.userId,
        is_draft: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      .select("id")
      .single();
    if (leadErr || !leadRow) throw (leadErr ? dbError(leadErr) : new Error("Failed to create lead"));
    const leadId = (leadRow as { id: string }).id;

    if (email || data.phone) {
      await context.supabase.from("lead_contacts").insert({
        lead_id: leadId,
        name: data.name,
        role: data.role ?? null,
        email: email ?? null,
        phone: data.phone ?? null,
        is_primary: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }

    const { error: updErr } = await context.supabase
      .from("leads")
      .update({ status: "converted" })
      .eq("id", leadId);
    if (updErr) throw dbError(updErr);

    // Trigger inserted the customer; fetch and return it.
    const { data: cust, error: custErr } = await context.supabase
      .from("customers")
      .select("*")
      .eq("converted_from_lead_id", leadId)
      .maybeSingle();
    if (custErr) throw dbError(custErr);
    if (!cust) throw new Error("Customer row was not created");

    // Activity log — include the customer code so the Activity Logs feed can
    // link directly to the customer detail page.
    const custRow = cust as unknown as CustomerRow;
    await context.supabase.from("lead_activities").insert({
      lead_id: leadId,
      actor_id: context.userId,
      kind: "created",
      body: `Customer created — ${custRow.customer_code}`,
      meta: { event: "customer_created", customer_id: custRow.id, customer_code: custRow.customer_code },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    return custRow;
  });

export const getCustomerByCode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string }) =>
    z.object({ code: z.string().trim().min(1) }).parse(data),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ customer: CustomerRow; leadSlug: string | null }> => {
      // Gate: customer detail requires customer_access + customer_view_detail.
      const { data: canAccess } = await context.supabase.rpc("has_permission", {
        _user_id: context.userId,
        _perm: "customer_access",
      });
      if (!canAccess) throw new Error("Forbidden: customer_access required");
      const { data: canDetail } = await context.supabase.rpc("has_permission", {
        _user_id: context.userId,
        _perm: "customer_view_detail",
      });
      if (!canDetail) throw new Error("Forbidden: customer_view_detail required");

      const { data: cust, error } = await context.supabase
        .from("customers")
        .select("*")
        .eq("customer_code", data.code)
        .maybeSingle();
      if (error) throw dbError(error);
      if (!cust) throw new Error("Customer not found");
      const customer = cust as unknown as CustomerRow;


      let leadSlug: string | null = null;
      if (customer.converted_from_lead_id) {
        const { data: l } = await context.supabase
          .from("leads")
          .select("slug")
          .eq("id", customer.converted_from_lead_id)
          .maybeSingle();
        leadSlug = (l as { slug: string } | null)?.slug ?? null;
      }
      return { customer, leadSlug };
    },
  );


export const deleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("customers").delete().eq("id", data.id);
    if (error) throw dbError(error);
    return { ok: true as const };
  });
