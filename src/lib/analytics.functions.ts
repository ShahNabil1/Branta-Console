// Analytics + Overview server functions.
// All handlers respect RLS as the calling user. When a super_admin / admin
// requests another user's scope, we still call Supabase as the caller —
// admin RLS policies allow the read. The client never dictates identity;
// we validate the target userId against the caller's role.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Types ----------
export type RangeKey = "today" | "7d" | "30d" | "90d" | "ytd";

export interface KpiValue {
  label: string;
  value: number;
  /** Delta vs the previous window of equal length. Positive = growth. */
  delta: number | null;
  /** Optional secondary currency for money tiles. */
  currency?: string | null;
  /** Optional href to click through to. */
  href?: string | null;
}

export interface OverviewKpis {
  newLeads: KpiValue;
  leadsTouched: KpiValue;
  meetingsToday: KpiValue;
  emailsSent: KpiValue;
  invoicesActionable: KpiValue;
  walletAvailableUsd: KpiValue;
  walletAvailableBdt: KpiValue;
}

export interface OverviewInboxItem {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  received_at: string;
  is_unread: boolean;
}

export interface OverviewMeeting {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  meeting_link: string | null;
  lead_slug: string | null;
}

export interface OverviewFollowUp {
  id: string;
  slug: string;
  name: string;
  company: string | null;
  next_action: string | null;
  last_activity_at: string;
  status: string;
  stalled: boolean;
}

export interface PipelineBucket {
  key: string;
  label: string;
  count: number;
  color_var: string | null;
}

export interface ActivityFeedItem {
  id: string;
  kind: string;
  title: string;
  meta: string;
  at: string;
  href: string | null;
}

export interface ScopeUser {
  user_id: string;
  full_name: string | null;
  employee_code: string | null;
}

// ---------- Helpers ----------
function rangeToBounds(range: RangeKey): { from: Date; to: Date; prevFrom: Date; prevTo: Date } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  switch (range) {
    case "today":
      from.setHours(0, 0, 0, 0);
      break;
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    case "90d":
      from.setDate(from.getDate() - 90);
      break;
    case "ytd":
      from.setMonth(0, 1);
      from.setHours(0, 0, 0, 0);
      break;
  }
  const spanMs = to.getTime() - from.getTime();
  const prevTo = new Date(from);
  const prevFrom = new Date(from.getTime() - spanMs);
  return { from, to, prevFrom, prevTo };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const [{ data: sa }, { data: ad }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  return Boolean(sa || ad);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isSuperAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  return Boolean(data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveScopeUser(supabase: any, callerId: string, requested?: string | null): Promise<string> {
  if (!requested || requested === callerId) return callerId;
  const sa = await isSuperAdmin(supabase, callerId);
  if (!sa) throw new Error("Forbidden: only super admins can view other users");
  return requested;
}


// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countRows(q: any): Promise<number> {
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function delta(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return Math.round(((cur - prev) / prev) * 100);
}

// ---------- Scope users (for the acting-as selector) ----------
export const listScopeUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ScopeUser[]> => {
    const sa = await isSuperAdmin(context.supabase, context.userId);
    if (!sa) return [];
    const { data, error } = await context.supabase
      .from("profiles")
      .select("user_id, full_name, employee_code")
      .order("full_name", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as ScopeUser[];
  });

const scopeInput = z.object({
  userId: z.string().uuid().optional().nullable(),
  range: z.enum(["today", "7d", "30d", "90d", "ytd"]).default("7d"),
});

// ---------- Overview KPIs ----------
export const getOverviewKpis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scopeInput.parse(d))
  .handler(async ({ data, context }): Promise<OverviewKpis> => {
    const scope = await resolveScopeUser(context.supabase, context.userId, data.userId ?? null);
    const { from, to, prevFrom, prevTo } = rangeToBounds(data.range);
    const supabase = context.supabase;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);
    const day24Ago = new Date(Date.now() - 24 * 3600_000);

    const [
      newLeadsCur,
      newLeadsPrev,
      touchedCur,
      touchedPrev,
      meetingsTodayC,
      emails24,
      emailsPrev24,
      invoicesActionableC,
      payoutsAvail,
      pendingWithdrawals,
    ] = await Promise.all([
      countRows(
        supabase.from("leads").select("id", { head: true, count: "exact" })
          .eq("owner_id", scope)
          .gte("created_at", from.toISOString())
          .lt("created_at", to.toISOString()),
      ),
      countRows(
        supabase.from("leads").select("id", { head: true, count: "exact" })
          .eq("owner_id", scope)
          .gte("created_at", prevFrom.toISOString())
          .lt("created_at", prevTo.toISOString()),
      ),
      supabase.from("lead_activities")
        .select("lead_id")
        .eq("actor_id", scope)
        .gte("created_at", from.toISOString())
        .lt("created_at", to.toISOString())
        .limit(5000),
      supabase.from("lead_activities")
        .select("lead_id")
        .eq("actor_id", scope)
        .gte("created_at", prevFrom.toISOString())
        .lt("created_at", prevTo.toISOString())
        .limit(5000),
      countRows(
        supabase.from("lead_meetings").select("id", { head: true, count: "exact" })
          .eq("created_by", scope)
          .gte("starts_at", todayStart.toISOString())
          .lt("starts_at", todayEnd.toISOString()),
      ),
      countRows(
        supabase.from("lead_emails").select("id", { head: true, count: "exact" })
          .eq("sent_by", scope)
          .eq("direction", "out")
          .gte("sent_at", day24Ago.toISOString()),
      ),
      countRows(
        supabase.from("lead_emails").select("id", { head: true, count: "exact" })
          .eq("sent_by", scope)
          .eq("direction", "out")
          .gte("sent_at", new Date(day24Ago.getTime() - 24 * 3600_000).toISOString())
          .lt("sent_at", day24Ago.toISOString()),
      ),
      countRows(
        supabase.from("invoices").select("id", { head: true, count: "exact" })
          .eq("created_by", scope)
          .in("status", ["draft", "sent", "overdue", "partially_paid"]),
      ),
      supabase.from("invoice_payouts")
        .select("currency, amount")
        .eq("user_id", scope)
        .eq("status", "available")
        .limit(2000),
      supabase.from("withdrawal_requests")
        .select("currency, amount")
        .eq("user_id", scope)
        .in("status", ["pending", "approved"])
        .limit(1000),
    ]);

    // distinct lead_ids for "touched"
    const touchedCurCount = new Set(((touchedCur.data ?? []) as { lead_id: string }[]).map((r) => r.lead_id)).size;
    const touchedPrevCount = new Set(((touchedPrev.data ?? []) as { lead_id: string }[]).map((r) => r.lead_id)).size;

    const payoutUsd = ((payoutsAvail.data ?? []) as { currency: string; amount: number }[])
      .filter((p) => p.currency === "USD").reduce((a, b) => a + Number(b.amount), 0);
    const payoutBdt = ((payoutsAvail.data ?? []) as { currency: string; amount: number }[])
      .filter((p) => p.currency === "BDT").reduce((a, b) => a + Number(b.amount), 0);
    const pendUsd = ((pendingWithdrawals.data ?? []) as { currency: string; amount: number }[])
      .filter((p) => p.currency === "USD").reduce((a, b) => a + Number(b.amount), 0);
    const pendBdt = ((pendingWithdrawals.data ?? []) as { currency: string; amount: number }[])
      .filter((p) => p.currency === "BDT").reduce((a, b) => a + Number(b.amount), 0);

    return {
      newLeads: {
        label: "New leads",
        value: newLeadsCur,
        delta: delta(newLeadsCur, newLeadsPrev),
        href: "/app/leads",
      },
      leadsTouched: {
        label: "Leads touched",
        value: touchedCurCount,
        delta: delta(touchedCurCount, touchedPrevCount),
      },
      meetingsToday: {
        label: "Meetings today",
        value: meetingsTodayC,
        delta: null,
      },
      emailsSent: {
        label: "Emails sent · 24h",
        value: emails24,
        delta: delta(emails24, emailsPrev24),
      },
      invoicesActionable: {
        label: "Open invoices",
        value: invoicesActionableC,
        delta: null,
        href: "/app/finance/invoices",
      },
      walletAvailableUsd: {
        label: "Wallet (USD)",
        value: Math.max(0, payoutUsd - pendUsd),
        delta: null,
        currency: "USD",
        href: "/app/profile/wallet",
      },
      walletAvailableBdt: {
        label: "Wallet (BDT)",
        value: Math.max(0, payoutBdt - pendBdt),
        delta: null,
        currency: "BDT",
        href: "/app/profile/wallet",
      },
    };
  });

// ---------- Overview: inbox / meetings / follow-ups ----------
export const getOverviewInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scopeInput.parse(d))
  .handler(async ({ data, context }): Promise<OverviewInboxItem[]> => {
    const scope = await resolveScopeUser(context.supabase, context.userId, data.userId ?? null);
    const { data: rows, error } = await context.supabase
      .from("inbox_messages")
      .select("gmail_message_id, from_email, from_name, subject, snippet, received_at, is_unread, handled_by")
      .or(`handled_by.eq.${scope},handled_by.is.null`)
      .eq("is_unread", true)
      .order("received_at", { ascending: false })
      .limit(8);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as {
      gmail_message_id: string;
      from_email: string;
      from_name: string | null;
      subject: string | null;
      snippet: string | null;
      received_at: string;
      is_unread: boolean;
    }[]).map((r) => ({
      id: r.gmail_message_id,
      from: r.from_name || r.from_email,
      subject: r.subject ?? "(no subject)",
      snippet: r.snippet ?? "",
      received_at: r.received_at,
      is_unread: r.is_unread,
    }));
  });

export const getTodaysMeetings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scopeInput.parse(d))
  .handler(async ({ data, context }): Promise<OverviewMeeting[]> => {
    const scope = await resolveScopeUser(context.supabase, context.userId, data.userId ?? null);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const { data: rows, error } = await context.supabase
      .from("lead_meetings")
      .select("id, title, starts_at, ends_at, meeting_link, lead_id, leads(slug)")
      .eq("created_by", scope)
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .order("starts_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as unknown as Array<{
      id: string; title: string; starts_at: string; ends_at: string;
      meeting_link: string | null; leads: { slug: string } | null;
    }>).map((r) => ({
      id: r.id, title: r.title, starts_at: r.starts_at, ends_at: r.ends_at,
      meeting_link: r.meeting_link, lead_slug: r.leads?.slug ?? null,
    }));
  });

export const getFollowUps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scopeInput.parse(d))
  .handler(async ({ data, context }): Promise<OverviewFollowUp[]> => {
    const scope = await resolveScopeUser(context.supabase, context.userId, data.userId ?? null);
    const { data: rows, error } = await context.supabase
      .from("leads")
      .select("id, slug, name, company, next_action, last_activity_at, status")
      .eq("owner_id", scope)
      .eq("is_draft", false)
      .not("status", "in", "(converted,lost)")
      .order("last_activity_at", { ascending: true })
      .limit(10);
    if (error) throw new Error(error.message);
    const fiveDaysAgo = Date.now() - 5 * 24 * 3600_000;
    return ((rows ?? []) as OverviewFollowUp[]).map((r) => ({
      ...r,
      stalled: new Date(r.last_activity_at).getTime() < fiveDaysAgo,
    }));
  });

// ---------- Pipeline funnel ----------
export const getPipelineFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scopeInput.parse(d))
  .handler(async ({ data, context }): Promise<PipelineBucket[]> => {
    const scope = await resolveScopeUser(context.supabase, context.userId, data.userId ?? null);
    const { from, to } = rangeToBounds(data.range);

    const [optsRes, leadsRes] = await Promise.all([
      context.supabase.from("lead_status_options")
        .select("key, label, sort_order, color_var, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      context.supabase.from("leads")
        .select("status")
        .eq("owner_id", scope)
        .eq("is_draft", false)
        .gte("created_at", from.toISOString())
        .lt("created_at", to.toISOString())
        .limit(5000),
    ]);
    if (optsRes.error) throw new Error(optsRes.error.message);
    if (leadsRes.error) throw new Error(leadsRes.error.message);

    const counts = new Map<string, number>();
    for (const r of (leadsRes.data ?? []) as { status: string }[]) {
      counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    }
    return ((optsRes.data ?? []) as Array<{
      key: string; label: string; sort_order: number; color_var: string | null;
    }>).map((o) => ({
      key: o.key, label: o.label, color_var: o.color_var,
      count: counts.get(o.key) ?? 0,
    }));
  });

// ---------- Live activity feed ----------
export const getActivityFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scopeInput.parse(d))
  .handler(async ({ data, context }): Promise<ActivityFeedItem[]> => {
    const scope = await resolveScopeUser(context.supabase, context.userId, data.userId ?? null);
    const supabase = context.supabase;

    const [leadAct, invAct] = await Promise.all([
      supabase.from("lead_activities")
        .select("id, kind, body, created_at, lead_id, leads(slug, name)")
        .eq("actor_id", scope)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase.from("invoice_activity_logs")
        .select("id, action, title, body, created_at, invoice_slug")
        .eq("actor_id", scope)
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    const out: ActivityFeedItem[] = [];
    for (const r of (leadAct.data ?? []) as Array<{
      id: string; kind: string; body: string | null; created_at: string;
      leads: { slug: string; name: string } | null;
    }>) {
      out.push({
        id: `l-${r.id}`,
        kind: r.kind,
        title: r.leads?.name ? `${r.leads.name} · ${r.kind}` : r.kind,
        meta: r.body ?? "",
        at: r.created_at,
        href: r.leads?.slug ? `/app/leads/${r.leads.slug}` : null,
      });
    }
    for (const r of (invAct.data ?? []) as Array<{
      id: string; action: string; title: string; body: string | null;
      created_at: string; invoice_slug: string;
    }>) {
      out.push({
        id: `i-${r.id}`,
        kind: r.action,
        title: r.title,
        meta: r.body ?? "",
        at: r.created_at,
        href: `/app/finance/invoices/${r.invoice_slug}`,
      });
    }

    out.sort((a, b) => (a.at < b.at ? 1 : -1));
    return out.slice(0, 20);
  });

// ---------- Activity heatmap (7 days × 24 hours) ----------
export interface HeatmapCell { dow: number; hour: number; count: number }

export const getActivityHeatmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scopeInput.parse(d))
  .handler(async ({ data, context }): Promise<HeatmapCell[]> => {
    const scope = await resolveScopeUser(context.supabase, context.userId, data.userId ?? null);
    const { from, to } = rangeToBounds(data.range);
    const { data: rows, error } = await context.supabase
      .from("lead_activities")
      .select("created_at")
      .eq("actor_id", scope)
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString())
      .limit(20000);
    if (error) throw new Error(error.message);
    const grid = new Map<string, number>();
    for (const r of (rows ?? []) as { created_at: string }[]) {
      const d = new Date(r.created_at);
      const key = `${d.getDay()}-${d.getHours()}`;
      grid.set(key, (grid.get(key) ?? 0) + 1);
    }
    const out: HeatmapCell[] = [];
    for (let dow = 0; dow < 7; dow++) {
      for (let h = 0; h < 24; h++) {
        out.push({ dow, hour: h, count: grid.get(`${dow}-${h}`) ?? 0 });
      }
    }
    return out;
  });

// ---------- Lead velocity: new vs converted per day ----------
export interface VelocityPoint { day: string; created: number; converted: number }

export const getLeadVelocity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scopeInput.parse(d))
  .handler(async ({ data, context }): Promise<VelocityPoint[]> => {
    const scope = await resolveScopeUser(context.supabase, context.userId, data.userId ?? null);
    const { from, to } = rangeToBounds(data.range);
    const { data: rows, error } = await context.supabase
      .from("leads")
      .select("created_at, status, updated_at")
      .eq("owner_id", scope)
      .eq("is_draft", false)
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString())
      .limit(10000);
    if (error) throw new Error(error.message);
    const map = new Map<string, VelocityPoint>();
    const bump = (d: string, key: "created" | "converted") => {
      const cur = map.get(d) ?? { day: d, created: 0, converted: 0 };
      cur[key]++;
      map.set(d, cur);
    };
    for (const r of (rows ?? []) as { created_at: string; status: string; updated_at: string }[]) {
      bump(r.created_at.slice(0, 10), "created");
      if (r.status === "converted") bump(r.updated_at.slice(0, 10), "converted");
    }
    // Fill missing days
    const points: VelocityPoint[] = [];
    for (let t = from.getTime(); t <= to.getTime(); t += 24 * 3600_000) {
      const d = new Date(t).toISOString().slice(0, 10);
      points.push(map.get(d) ?? { day: d, created: 0, converted: 0 });
    }
    return points;
  });

// ---------- Source mix ----------
export interface SourceSlice { source: string; count: number; converted: number }

export const getLeadSourceMix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scopeInput.parse(d))
  .handler(async ({ data, context }): Promise<SourceSlice[]> => {
    const scope = await resolveScopeUser(context.supabase, context.userId, data.userId ?? null);
    const { from, to } = rangeToBounds(data.range);
    const { data: rows, error } = await context.supabase
      .from("leads")
      .select("source, status")
      .eq("owner_id", scope)
      .eq("is_draft", false)
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString())
      .limit(10000);
    if (error) throw new Error(error.message);
    const m = new Map<string, SourceSlice>();
    for (const r of (rows ?? []) as { source: string | null; status: string }[]) {
      const k = r.source || "unknown";
      const cur = m.get(k) ?? { source: k, count: 0, converted: 0 };
      cur.count++;
      if (r.status === "converted") cur.converted++;
      m.set(k, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.count - a.count);
  });

// ---------- Finance attribution (revenue booked to the user as stakeholder) ----------
export interface FinanceAttribution {
  bookedUsd: number;
  bookedBdt: number;
  pipelineUsd: number;
  pipelineBdt: number;
  monthly: Array<{ month: string; usd: number; bdt: number }>;
}

export const getFinanceAttribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scopeInput.parse(d))
  .handler(async ({ data, context }): Promise<FinanceAttribution> => {
    const scope = await resolveScopeUser(context.supabase, context.userId, data.userId ?? null);
    const { from, to } = rangeToBounds(data.range);
    const supabase = context.supabase;

    // Booked = paid invoice_payouts within window
    const [paidRes, availRes] = await Promise.all([
      supabase.from("invoice_payouts")
        .select("currency, amount, paid_at")
        .eq("user_id", scope)
        .eq("status", "paid")
        .gte("paid_at", from.toISOString())
        .lt("paid_at", to.toISOString())
        .limit(5000),
      supabase.from("invoice_payouts")
        .select("currency, amount, status")
        .eq("user_id", scope)
        .in("status", ["locked", "available"])
        .limit(5000),
    ]);
    if (paidRes.error) throw new Error(paidRes.error.message);
    if (availRes.error) throw new Error(availRes.error.message);

    let bookedUsd = 0, bookedBdt = 0, pipelineUsd = 0, pipelineBdt = 0;
    const monthMap = new Map<string, { usd: number; bdt: number }>();
    for (const r of (paidRes.data ?? []) as Array<{ currency: string; amount: number; paid_at: string | null }>) {
      const a = Number(r.amount);
      if (r.currency === "USD") bookedUsd += a; else bookedBdt += a;
      if (r.paid_at) {
        const m = r.paid_at.slice(0, 7);
        const cur = monthMap.get(m) ?? { usd: 0, bdt: 0 };
        if (r.currency === "USD") cur.usd += a; else cur.bdt += a;
        monthMap.set(m, cur);
      }
    }
    for (const r of (availRes.data ?? []) as Array<{ currency: string; amount: number }>) {
      const a = Number(r.amount);
      if (r.currency === "USD") pipelineUsd += a; else pipelineBdt += a;
    }
    const monthly = Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, usd: v.usd, bdt: v.bdt }));
    return { bookedUsd, bookedBdt, pipelineUsd, pipelineBdt, monthly };
  });

// ---------- Team leaderboard (admin only) ----------
export interface LeaderboardRow {
  user_id: string;
  full_name: string | null;
  employee_code: string | null;
  leads_created: number;
  leads_converted: number;
  emails_sent: number;
  meetings_held: number;
  revenue_usd: number;
  revenue_bdt: number;
}

export const getTeamLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => scopeInput.parse(d))
  .handler(async ({ data, context }): Promise<LeaderboardRow[]> => {
    const admin = await isAdmin(context.supabase, context.userId);
    if (!admin) throw new Error("Forbidden: admin only");
    const { from, to } = rangeToBounds(data.range);
    const supabase = context.supabase;
    const [profiles, leads, emails, meetings, payouts] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, employee_code").limit(1000),
      supabase.from("leads")
        .select("owner_id, status, created_at")
        .eq("is_draft", false)
        .gte("created_at", from.toISOString())
        .lt("created_at", to.toISOString())
        .limit(20000),
      supabase.from("lead_emails")
        .select("sent_by, direction, sent_at")
        .eq("direction", "out")
        .gte("sent_at", from.toISOString())
        .lt("sent_at", to.toISOString())
        .limit(20000),
      supabase.from("lead_meetings")
        .select("created_by, status, starts_at")
        .eq("status", "held")
        .gte("starts_at", from.toISOString())
        .lt("starts_at", to.toISOString())
        .limit(10000),
      supabase.from("invoice_payouts")
        .select("user_id, currency, amount, paid_at")
        .eq("status", "paid")
        .gte("paid_at", from.toISOString())
        .lt("paid_at", to.toISOString())
        .limit(20000),
    ]);

    const rows = new Map<string, LeaderboardRow>();
    for (const p of ((profiles.data ?? []) as Array<{ user_id: string; full_name: string | null; employee_code: string | null }>)) {
      rows.set(p.user_id, {
        user_id: p.user_id, full_name: p.full_name, employee_code: p.employee_code,
        leads_created: 0, leads_converted: 0, emails_sent: 0, meetings_held: 0,
        revenue_usd: 0, revenue_bdt: 0,
      });
    }
    for (const l of (leads.data ?? []) as Array<{ owner_id: string | null; status: string }>) {
      if (!l.owner_id) continue;
      const r = rows.get(l.owner_id); if (!r) continue;
      r.leads_created++;
      if (l.status === "converted") r.leads_converted++;
    }
    for (const e of (emails.data ?? []) as Array<{ sent_by: string | null }>) {
      if (!e.sent_by) continue;
      const r = rows.get(e.sent_by); if (r) r.emails_sent++;
    }
    for (const m of (meetings.data ?? []) as Array<{ created_by: string | null }>) {
      if (!m.created_by) continue;
      const r = rows.get(m.created_by); if (r) r.meetings_held++;
    }
    for (const p of (payouts.data ?? []) as Array<{ user_id: string; currency: string; amount: number }>) {
      const r = rows.get(p.user_id); if (!r) continue;
      const a = Number(p.amount);
      if (p.currency === "USD") r.revenue_usd += a; else r.revenue_bdt += a;
    }
    return Array.from(rows.values())
      .filter((r) => r.leads_created || r.emails_sent || r.meetings_held || r.revenue_usd || r.revenue_bdt)
      .sort((a, b) => (b.leads_converted - a.leads_converted) || (b.revenue_usd - a.revenue_usd));
  });
