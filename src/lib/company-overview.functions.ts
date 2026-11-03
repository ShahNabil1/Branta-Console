// Sister-company dashboard: read-only, scoped to one company's own records.
// RLS still applies as the caller; membership is checked first. No finance data.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError } from "@/lib/db-errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export type CompanyOverview = {
  company: { id: string; name: string; slug: string };
  kpis: { newLeads30d: number; openLeads: number; meetingsToday: number; unreadInbox: number };
  recentLeads: { id: string; slug: string; name: string; status: string; created_at: string }[];
  upcoming: { id: string; title: string; starts_at: string; meeting_link: string | null; lead_slug: string | null }[];
  inbox: { id: string; from: string; subject: string; received_at: string; unread: boolean }[];
};

const CLOSED = ["won", "lost", "converted", "closed", "archived"];

export const getCompanyOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ company: z.string().regex(/^[a-z0-9-]{1,80}$/) }).parse(i))
  .handler(async ({ data, context }): Promise<CompanyOverview> => {
    const sb = context.supabase as Any;
    const { data: co, error } = await sb.from("companies").select("id, name, slug, is_holding").eq("slug", data.company).maybeSingle();
    if (error) throw dbError(error);
    if (!co || co.is_holding) throw new Error("Company not found.");
    const [{ data: member }, { data: manage }] = await Promise.all([
      sb.rpc("is_company_member", { _company: co.id, _user: context.userId }),
      sb.rpc("can_manage_company", { _company: co.id, _user: context.userId }),
    ]);
    if (!member && !manage) throw new Error("You are not a member of this company.");

    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const since = new Date(now.getTime() - 30 * 86400_000);
    const cnt = (q: Any) => q.then((r: Any) => { if (r.error) throw dbError(r.error); return r.count ?? 0; });

    const [newLeads30d, openLeads, meetingsToday, unreadInbox, leads, meets, inbox] = await Promise.all([
      cnt(sb.from("leads").select("id", { head: true, count: "exact" }).eq("company_id", co.id).gte("created_at", since.toISOString())),
      cnt(sb.from("leads").select("id", { head: true, count: "exact" }).eq("company_id", co.id).not("status", "in", `(${CLOSED.join(",")})`)),
      cnt(sb.from("lead_meetings").select("id", { head: true, count: "exact" }).eq("company_id", co.id).neq("status", "cancelled")
        .gte("starts_at", dayStart.toISOString()).lt("starts_at", dayEnd.toISOString())),
      cnt(sb.from("inbox_messages").select("gmail_message_id", { head: true, count: "exact" }).eq("company_id", co.id).eq("is_unread", true)),
      sb.from("leads").select("id, slug, name, status, created_at").eq("company_id", co.id).order("created_at", { ascending: false }).limit(6),
      sb.from("lead_meetings").select("id, title, starts_at, meeting_link, leads(slug)").eq("company_id", co.id).neq("status", "cancelled")
        .gte("starts_at", now.toISOString()).order("starts_at").limit(5),
      sb.from("inbox_messages").select("gmail_message_id, from_name, from_email, subject, received_at, is_unread").eq("company_id", co.id)
        .order("received_at", { ascending: false }).limit(5),
    ]);
    for (const r of [leads, meets, inbox]) if (r.error) throw dbError(r.error);

    return {
      company: { id: co.id, name: co.name, slug: co.slug },
      kpis: { newLeads30d, openLeads, meetingsToday, unreadInbox },
      recentLeads: leads.data ?? [],
      upcoming: (meets.data ?? []).map((m: Any) => ({
        id: m.id, title: m.title, starts_at: m.starts_at, meeting_link: m.meeting_link,
        lead_slug: (Array.isArray(m.leads) ? m.leads[0]?.slug : m.leads?.slug) ?? null,
      })),
      inbox: (inbox.data ?? []).map((m: Any) => ({
        id: m.gmail_message_id, from: m.from_name || m.from_email, subject: m.subject || "(no subject)",
        received_at: m.received_at, unread: m.is_unread,
      })),
    };
  });
