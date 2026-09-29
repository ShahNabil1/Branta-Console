// Lead Dashboard summary — counts respect RLS (each user sees what they can access).
import { dbError } from "@/lib/db-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  owner: z.string().uuid().nullable(),
  source: z.string().max(80).nullable(),
  status: z.string().max(80).nullable(),
  service: z.string().max(80).nullable(),
  priority: z.string().max(20).nullable(),
});
export type LeadDashboardInput = z.infer<typeof Input>;

export interface LeadDashboardData {
  totals: {
    total: number;
    new: number;
    contacted: number;
    followUp: number;
    proposal: number;
    negotiation: number;
    converted: number;
    lost: number;
  };
  byStatus: { key: string; count: number }[];
  bySource: { key: string; count: number }[];
  byOwner: { id: string; name: string; total: number; converted: number }[];
  owners: { id: string; name: string }[];
}

export const getLeadDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<LeadDashboardData> => {
    let q = context.supabase
      .from("leads")
      .select("id,status,source,service,priority,owner_id,next_follow_up_at,created_at")
      .eq("is_draft", false)
      .limit(10000);
    if (data.from) q = q.gte("created_at", new Date(`${data.from}T00:00:00+06:00`).toISOString());
    if (data.to) q = q.lte("created_at", new Date(`${data.to}T23:59:59.999+06:00`).toISOString());
    if (data.owner) q = q.eq("owner_id", data.owner);
    if (data.source) q = q.eq("source", data.source);
    if (data.status) q = q.eq("status", data.status);
    if (data.service) q = q.eq("service", data.service);
    if (data.priority) q = q.eq("priority", data.priority);
    const { data: rows, error } = await q;
    if (error) throw dbError(error);
    const list = rows ?? [];

    // End of today in Dhaka
    const todayBD = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10);
    const endToday = new Date(`${todayBD}T23:59:59.999+06:00`).getTime();

    const t = { total: list.length, new: 0, contacted: 0, followUp: 0, proposal: 0, negotiation: 0, converted: 0, lost: 0 };
    const st = new Map<string, number>();
    const src = new Map<string, number>();
    const own = new Map<string, { total: number; converted: number }>();
    for (const r of list) {
      const s = r.status as string;
      st.set(s, (st.get(s) ?? 0) + 1);
      const so = (r.source as string | null) ?? "unknown";
      src.set(so, (src.get(so) ?? 0) + 1);
      if (s === "new") t.new++;
      else if (s === "contacted") t.contacted++;
      else if (s === "proposal_sent") t.proposal++;
      else if (s === "negotiation") t.negotiation++;
      else if (s === "converted") t.converted++;
      else if (s === "lost") t.lost++;
      if (
        r.next_follow_up_at &&
        s !== "converted" &&
        s !== "lost" &&
        new Date(r.next_follow_up_at as string).getTime() <= endToday
      )
        t.followUp++;
      if (r.owner_id) {
        const o = own.get(r.owner_id) ?? { total: 0, converted: 0 };
        o.total++;
        if (s === "converted") o.converted++;
        own.set(r.owner_id, o);
      }
    }

    // Owner names (all employees for the filter)
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("user_id,full_name,employee_code")
      .limit(1000);
    const nameOf = new Map<string, string>();
    for (const p of profs ?? []) {
      nameOf.set(p.user_id, `${p.full_name ?? "Unnamed"}${p.employee_code ? ` (${p.employee_code})` : ""}`);
    }
    const sortDesc = (m: Map<string, number>) =>
      [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);

    return {
      totals: t,
      byStatus: sortDesc(st),
      bySource: sortDesc(src),
      byOwner: [...own.entries()]
        .map(([id, v]) => ({ id, name: nameOf.get(id) ?? "Unknown", ...v }))
        .sort((a, b) => b.total - a.total),
      owners: [...nameOf.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
