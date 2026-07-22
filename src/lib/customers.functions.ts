// Customers module — manual create + auto-populated from Converted leads.
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
    const { data, error } = await context.supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as CustomerRow[];
    const ownerIds = Array.from(
      new Set(rows.map((r) => r.owner_id).filter(Boolean) as string[]),
    );
    if (ownerIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ownerIds);
      const nameByUser = new Map<string, string | null>();
      (profs ?? []).forEach((p: { user_id: string; full_name: string | null }) =>
        nameByUser.set(p.user_id, p.full_name),
      );
      return rows.map((r) => ({
        ...r,
        owner_name: r.owner_id ? nameByUser.get(r.owner_id) ?? null : null,
      }));
    }
    return rows;
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select("id")
      .single();
    if (leadErr || !leadRow) throw new Error(leadErr?.message ?? "Failed to create lead");
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
    if (updErr) throw new Error(updErr.message);

    // Trigger inserted the customer; fetch and return it.
    const { data: cust, error: custErr } = await context.supabase
      .from("customers")
      .select("*")
      .eq("converted_from_lead_id", leadId)
      .maybeSingle();
    if (custErr) throw new Error(custErr.message);
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
      const { data: cust, error } = await context.supabase
        .from("customers")
        .select("*")
        .eq("customer_code", data.code)
        .maybeSingle();
      if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
