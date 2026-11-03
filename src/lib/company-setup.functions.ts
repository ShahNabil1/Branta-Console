// Required setup for a sister company. Creation itself is hard-blocked in the
// database (company_gate_trigger) and integration use is hard-blocked in the
// server functions (zero fallback); this only tells the UI what is missing.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type SetupItem = "lead" | "customer" | "invoice" | "expense" | "fund_allocation";
export type IntegrationItem = "google" | "inbox_address" | "email_provider";

export const getCompanySetupStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: z.string().min(1).max(80) }).parse(i))
  .handler(async ({ data, context }) => {
    const none = { missing: [] as SetupItem[], integrations: [] as IntegrationItem[] };
    // Visibility check runs as the caller: no access = no answer.
    const { data: co } = await context.supabase.from("companies").select("id, is_holding").eq("slug", data.slug).maybeSingle();
    if (!co || (co as { is_holding: boolean }).is_holding) return none;
    const id = (co as { id: string }).id;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const [m, g, a, p] = await Promise.all([
      sb.rpc("company_setup_missing", { _company: id }),
      sb.from("company_google_accounts").select("company_id").eq("company_id", id).maybeSingle(),
      sb.from("company_inbox_addresses").select("verified_at").eq("company_id", id).maybeSingle(),
      sb.from("company_email_providers").select("id").eq("company_id", id).eq("is_active", true)
        .not("domain_verified_at", "is", null).limit(1),
    ]);
    if (m.error) throw new Error("Could not check company setup.");
    const integrations: IntegrationItem[] = [];
    if (!g.data) integrations.push("google");
    if (!a.data?.verified_at) integrations.push("inbox_address");
    if (!(p.data ?? []).length) integrations.push("email_provider");
    return { missing: (m.data ?? []) as SetupItem[], integrations };
  });
