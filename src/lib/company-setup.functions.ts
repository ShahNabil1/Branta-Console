// Required setup for a sister company. Creation itself is hard-blocked in the
// database (company_gate_trigger); this only tells the UI what is missing.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type SetupItem = "lead" | "customer" | "invoice" | "expense" | "fund_allocation";

export const getCompanySetupStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: z.string().min(1).max(80) }).parse(i))
  .handler(async ({ data, context }) => {
    // Visibility check runs as the caller: no access = no answer.
    const { data: co } = await context.supabase.from("companies").select("id, is_holding").eq("slug", data.slug).maybeSingle();
    if (!co) return { missing: [] as SetupItem[] };
    if ((co as { is_holding: boolean }).is_holding) return { missing: [] as SetupItem[] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m, error } = await (supabaseAdmin as any).rpc("company_setup_missing", { _company: (co as { id: string }).id });
    if (error) throw new Error("Could not check company setup.");
    return { missing: (m ?? []) as SetupItem[] };
  });
