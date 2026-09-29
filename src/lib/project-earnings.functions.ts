import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "@/lib/db-errors";

export type ProjectEarning = {
  payout_id: string; earned_at: string; client: string | null; project: string | null; project_id: string | null;
  invoice_slug: string | null; installment: string | null; task: string | null; amount: number; currency: string; status: string;
};

/** Employee Fund earnings credited to the existing wallet. Own rows, or any user for Finance/Admin (checked in DB). */
export const getProjectEarnings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<ProjectEarning[]> => {
    const { data: rows, error } = await (context.supabase as any).rpc("project_earnings", { _user: data.userId ?? context.userId });
    if (error) throw dbError(error);
    return ((rows ?? []) as any[]).map((r) => ({ ...r, amount: Number(r.amount) }));
  });
