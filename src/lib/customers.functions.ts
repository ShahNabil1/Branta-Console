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
    const { data: row, error } = await context.supabase
      .from("customers")
      .insert({
        name: data.name,
        role: data.role ?? null,
        company: data.company ?? null,
        email,
        phone: data.phone ?? null,
        source: data.source ?? null,
        service: data.service ?? null,
        currency: data.currency,
        notes: data.notes ?? null,
        owner_id: data.owner_id ?? context.userId,
        created_by: context.userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as CustomerRow;
  });

export const deleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("customers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
