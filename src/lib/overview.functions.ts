// Overview board — one aggregated, read-only call for the redesigned Overview page.
// RLS applies as the caller. Finance data is only returned to finance admins.
import { dbError } from "@/lib/db-errors";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface BoardLead {
  id: string;
  slug: string;
  name: string;
  company: string | null;
  service: string | null;
  status: string;
  value: number | null;
  currency: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  ownerName: string | null;
  ownerAvatar: string | null;
  nextFollowUp: string | null;
  lastActivity: string | null;
  nextAction: string | null;
  notes: string | null;
  priority: string | null;
}
export interface BoardInvoice {
  id: string;
  slug: string;
  title: string | null;
  total: number;
  paid: number;
  currency: string;
  due: string | null;
  status: string;
}
export interface BoardPayment {
  id: string;
  employee: string;
  amount: number;
  status: string;
  description: string | null;
}
export interface OverviewBoard {
  firstName: string;
  isFinance: boolean;
  isAdmin: boolean;
  attention: {
    followUpsOverdue: BoardLead[];
    leadsNotContacted: BoardLead[];
    invoicesOverdue: BoardInvoice[];
    paymentsPending: BoardPayment[];
  };
  openInvoices: BoardInvoice[];
  revenueMonthBdt: number | null;
  revenuePrevMonthBdt: number | null;
  stages: { key: string; label: string; color: string | null; leads: BoardLead[]; count: number }[];
  series: { day: string; income: number; expense: number }[];
  team: { userId: string; name: string; avatar: string | null; leads: number; due: number; value: number }[];
}

const Input = z.object({
  userId: z.string().uuid().nullable().optional(),
  chart: z.enum(["7d", "30d", "90d", "ytd"]).default("30d"),
});

const dhakaDay = (d: Date) => new Date(d.getTime() + 6 * 3600_000).toISOString().slice(0, 10);

export const getOverviewBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }): Promise<OverviewBoard> => {
    const sb = context.supabase;
    const me = context.userId;
    const [{ data: sa }, { data: ad }, { data: fin }] = await Promise.all([
      sb.rpc("has_role", { _user_id: me, _role: "super_admin" }),
      sb.rpc("has_role", { _user_id: me, _role: "admin" }),
      sb.rpc("is_finance_admin", { _user_id: me }),
    ]);
    const isAdmin = Boolean(sa || ad);
    const isFinance = Boolean(fin);
    let scope = me;
    if (data.userId && data.userId !== me) {
      if (!sa) throw new Error("Only super admins can view other users.");
      scope = data.userId;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();

    const [profsRes, optsRes, leadsRes] = await Promise.all([
      sb.from("profiles").select("user_id,full_name,avatar_url,deactivated_at").limit(1000),
      sb.from("lead_status_options").select("key,label,sort_order,color_var").eq("is_active", true).order("sort_order"),
      sb.from("leads")
        .select("id,slug,name,company,service,status,budget,currency,phone,whatsapp,email:alt_email,owner_id,next_follow_up_at,last_activity_at,next_action,notes,priority,created_at")
        .eq("is_draft", false)
        .eq("owner_id", scope)
        .order("last_activity_at", { ascending: false })
        .limit(1000),
    ]);
    if (profsRes.error) throw dbError(profsRes.error);
    if (optsRes.error) throw dbError(optsRes.error);
    if (leadsRes.error) throw dbError(leadsRes.error);

    const prof = new Map<string, { name: string; avatar: string | null; active: boolean }>();
    for (const p of profsRes.data ?? [])
      prof.set(p.user_id, { name: p.full_name ?? "Unnamed", avatar: p.avatar_url, active: !p.deactivated_at });

    type LeadRow = {
      id: string; slug: string; name: string; company: string | null; service: string | null;
      status: string; budget: number | null; currency: string | null; phone: string | null;
      whatsapp: string | null; email: string | null; owner_id: string | null;
      next_follow_up_at: string | null; last_activity_at: string | null; next_action: string | null;
      notes: string | null; priority: string | null; created_at: string;
    };
    const toLead = (r: LeadRow): BoardLead => ({
      id: r.id, slug: r.slug, name: r.name, company: r.company, service: r.service, status: r.status,
      value: r.budget != null ? Number(r.budget) : null, currency: r.currency,
      phone: r.phone, whatsapp: r.whatsapp, email: r.email,
      ownerName: r.owner_id ? prof.get(r.owner_id)?.name ?? null : null,
      ownerAvatar: r.owner_id ? prof.get(r.owner_id)?.avatar ?? null : null,
      nextFollowUp: r.next_follow_up_at, lastActivity: r.last_activity_at,
      nextAction: r.next_action, notes: r.notes, priority: r.priority,
    });
    const leads = (leadsRes.data ?? []) as unknown as LeadRow[];
    const open = leads.filter((l) => l.status !== "converted" && l.status !== "lost");
    const followUpsOverdue = open
      .filter((l) => l.next_follow_up_at && l.next_follow_up_at < nowIso)
      .sort((a, b) => (a.next_follow_up_at! < b.next_follow_up_at! ? -1 : 1))
      .map(toLead);
    const leadsNotContacted = leads
      .filter((l) => l.status === "new" && l.created_at < dayAgo)
      .map(toLead);

    const stages = ((optsRes.data ?? []) as { key: string; label: string; color_var: string | null }[])
      .filter((o) => o.key !== "lost")
      .map((o) => {
        const inStage = leads.filter((l) => l.status === o.key);
        return { key: o.key, label: o.label, color: o.color_var, count: inStage.length, leads: inStage.slice(0, 6).map(toLead) };
      });

    // Finance-only blocks
    let invoicesOverdue: BoardInvoice[] = [];
    let openInvoices: BoardInvoice[] = [];
    let paymentsPending: BoardPayment[] = [];
    let revenueMonthBdt: number | null = null;
    let revenuePrevMonthBdt: number | null = null;
    let series: OverviewBoard["series"] = [];
    let team: OverviewBoard["team"] = [];

    if (isFinance) {
      const days = data.chart === "7d" ? 7 : data.chart === "30d" ? 30 : data.chart === "90d" ? 90 : null;
      const start = days
        ? new Date(now.getTime() - (days - 1) * 86400_000)
        : new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      const startDay = dhakaDay(start);
      const today = dhakaDay(now);
      const monthStart = today.slice(0, 8) + "01";
      const pm = new Date(`${monthStart}T00:00:00Z`);
      pm.setUTCMonth(pm.getUTCMonth() - 1);
      const prevMonthStart = pm.toISOString().slice(0, 10);
      const earliest = startDay < prevMonthStart ? startDay : prevMonthStart;

      const [invRes, efpRes, instRes, expRes] = await Promise.all([
        sb.from("invoices")
          .select("id,slug,title,total_amount,paid_amount,currency,due_date,status")
          .is("archived_at", null)
          .in("status", ["sent", "partially_paid", "overdue"])
          .order("due_date", { ascending: true })
          .limit(500),
        sb.from("employee_fund_payments")
          .select("id,employee_id,amount,status,description")
          .in("status", ["draft", "approved", "committed"])
          .order("created_at", { ascending: false })
          .limit(200),
        sb.from("invoice_installments")
          .select("paid_amount,paid_at,invoices!inner(currency,archived_at)")
          .not("paid_at", "is", null)
          .gte("paid_at", new Date(`${earliest}T00:00:00+06:00`).toISOString())
          .limit(5000),
        sb.from("expenses")
          .select("amount,currency,spent_on")
          .is("deleted_at", null)
          .gte("spent_on", startDay)
          .limit(5000),
      ]);
      if (invRes.error) throw dbError(invRes.error);
      openInvoices = (invRes.data ?? []).map((i) => ({
        id: i.id, slug: i.slug, title: i.title, total: Number(i.total_amount ?? 0),
        paid: Number(i.paid_amount ?? 0), currency: i.currency, due: i.due_date, status: i.status,
      }));
      invoicesOverdue = openInvoices.filter((i) => i.status === "overdue" || (i.due && i.due < today));

      const profById = new Map<string, string>();
      for (const p of profsRes.data ?? []) profById.set(p.user_id, p.full_name ?? "Unnamed");
      if (!efpRes.error) {
        const ids = [...new Set((efpRes.data ?? []).map((e) => e.employee_id))];
        const { data: ep } = ids.length
          ? await sb.from("profiles").select("id,user_id,full_name").or(`id.in.(${ids.join(",")}),user_id.in.(${ids.join(",")})`)
          : { data: [] as { id: string; user_id: string; full_name: string | null }[] };
        const nm = new Map<string, string>();
        for (const p of ep ?? []) { nm.set(p.id, p.full_name ?? "Unnamed"); nm.set(p.user_id, p.full_name ?? "Unnamed"); }
        paymentsPending = (efpRes.data ?? []).map((e) => ({
          id: e.id, employee: nm.get(e.employee_id) ?? "Employee", amount: Number(e.amount), status: e.status, description: e.description,
        }));
      }

      const inc = new Map<string, number>();
      let cur = 0, prev = 0;
      for (const r of (instRes.data ?? []) as unknown as { paid_amount: number; paid_at: string; invoices: { currency: string; archived_at: string | null } }[]) {
        if (r.invoices?.currency !== "BDT" || r.invoices?.archived_at) continue;
        const d = dhakaDay(new Date(r.paid_at));
        const amt = Number(r.paid_amount ?? 0);
        if (d >= startDay) inc.set(d, (inc.get(d) ?? 0) + amt);
        if (d >= monthStart) cur += amt;
        else if (d >= prevMonthStart) prev += amt;
      }
      revenueMonthBdt = cur;
      revenuePrevMonthBdt = prev;
      const exp = new Map<string, number>();
      for (const e of expRes.data ?? []) {
        if (e.currency !== "BDT" || !e.spent_on) continue;
        exp.set(e.spent_on, (exp.get(e.spent_on) ?? 0) + Number(e.amount ?? 0));
      }
      for (let d = new Date(`${startDay}T00:00:00Z`); d.toISOString().slice(0, 10) <= today; d.setUTCDate(d.getUTCDate() + 1)) {
        const k = d.toISOString().slice(0, 10);
        series.push({ day: k, income: inc.get(k) ?? 0, expense: exp.get(k) ?? 0 });
      }
    }

    if (isAdmin || isFinance) {
      const { data: all } = await sb.from("leads")
        .select("owner_id,status,budget,currency,next_follow_up_at")
        .eq("is_draft", false)
        .not("status", "in", "(converted,lost)")
        .limit(10000);
      const m = new Map<string, { leads: number; due: number; value: number }>();
      for (const l of all ?? []) {
        if (!l.owner_id) continue;
        const o = m.get(l.owner_id) ?? { leads: 0, due: 0, value: 0 };
        o.leads++;
        if (l.next_follow_up_at && l.next_follow_up_at < nowIso) o.due++;
        if (l.currency !== "USD" && l.budget) o.value += Number(l.budget);
        m.set(l.owner_id, o);
      }
      team = [...m.entries()]
        .filter(([id]) => prof.get(id)?.active !== false)
        .map(([userId, v]) => ({ userId, name: prof.get(userId)?.name ?? "Unknown", avatar: prof.get(userId)?.avatar ?? null, ...v }))
        .sort((a, b) => b.leads - a.leads)
        .slice(0, 6);
    }

    const full = prof.get(me)?.name ?? "";
    return {
      firstName: full.split(" ")[0] || "there",
      isFinance, isAdmin,
      attention: { followUpsOverdue, leadsNotContacted, invoicesOverdue, paymentsPending },
      openInvoices, revenueMonthBdt, revenuePrevMonthBdt, stages, series, team,
    };
  });
