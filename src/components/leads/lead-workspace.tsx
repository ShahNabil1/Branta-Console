// Mobile-first lead workspace: compact header, Timeline (Messenger-style),
// Details (structured fields) and More (existing full lead tools).
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BackToLeadsLink } from "@/components/leads/back-to-leads-link";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarClock,
  Loader2,
  Mail,
  Phone,
  SendHorizontal,
  UserRound,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/social/whatsapp-icon";
import { ConvertToClientButton } from "@/components/clients/convert-to-client-button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  addLeadActivity,
  listLeadActivities,
  updateLead,
  type AssignableUser,
  type LeadActivityRow,
  type LeadRow,
} from "@/lib/leads.functions";
import {
  listLeadServiceOptions,
  listLeadSourceOptions,
  listLeadStatusOptions,
  SERVICE_FALLBACK,
  SOURCE_FALLBACK,
  STATUS_FALLBACK,
  statusColorVar,
  statusLabel,
} from "@/lib/lead-options.functions";
import { getMyPermissions } from "@/lib/permissions.functions";
import { LeadDetail } from "./lead-detail";
import {
  bdToISO,
  dayLabel,
  followUpState,
  fmtFollowUp,
  fmtTime,
  initialsOf,
  isoToBD,
  PRIORITY_OPTIONS,
  priorityMeta,
  sameDay,
  waLink,
} from "./lead-meta";

type Tab = "timeline" | "details" | "more";

const USER_KINDS = new Set(["note", "update", "call", "proposal_sent", "portfolio_shared", "client_replied", "email", "meeting"]);
const KIND_LABEL: Record<string, string> = {
  proposal_sent: "Proposal sent",
  portfolio_shared: "Portfolio shared",
  client_replied: "Client replied",
  call: "Call",
};

export function LeadWorkspace({
  lead,
  users,
  onDeleted,
}: {
  lead: LeadRow;
  users: AssignableUser[];
  onDeleted: () => void;
}) {
  const [tab, setTab] = useState<Tab>("timeline");
  const qc = useQueryClient();
  const updFn = useServerFn(updateLead);
  const stFn = useServerFn(listLeadStatusOptions);
  const statuses = useQuery({ queryKey: ["lead-status-options"], queryFn: () => stFn(), initialData: STATUS_FALLBACK, staleTime: 300_000 }).data;
  const accent = `var(${statusColorVar(lead.status, statuses)})`;
  const pr = priorityMeta(lead.priority);
  const wa = lead.whatsapp || lead.phone;

  const statusM = useMutation({
    mutationFn: (status: string) => updFn({ data: { id: lead.id, patch: { status } } }),
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-3 pb-2 pt-3 sm:px-5">
        <div className="flex items-start gap-2">
          <BackToLeadsLink
            aria-label="Back to leads"
            className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted active:scale-95"
          >
            <ArrowLeft className="size-5" />
          </BackToLeadsLink>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[17px] font-bold text-foreground">{lead.name || "—"}</h1>
              <span className="shrink-0 font-mono text-[11.5px] font-semibold text-primary">{lead.slug ?? lead.lead_code}</span>
            </div>
            <div className="truncate text-[13px] text-muted-foreground">
              {[lead.company, lead.owner_name ? `Owner: ${lead.owner_name}` : null].filter(Boolean).join(" · ") || "—"}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <label
                className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold"
                style={{ color: accent, borderColor: `color-mix(in oklab, ${accent} 45%, transparent)`, background: `color-mix(in oklab, ${accent} 12%, transparent)` }}
              >
                {statusM.isPending ? <Loader2 className="size-3 animate-spin" /> : <span className="size-1.5 rounded-full" style={{ background: accent }} />}
                {statusLabel(lead.status, statuses)}
                <select
                  aria-label="Change status"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={lead.status}
                  onChange={(e) => statusM.mutate(e.target.value)}
                >
                  {statuses.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </label>
              <span className="rounded-full px-2.5 py-1 text-[12.5px] font-semibold" style={{ color: `var(${pr.tone})`, background: `color-mix(in oklab, var(${pr.tone}) 12%, transparent)` }}>
                {pr.label}
              </span>
              {lead.next_follow_up_at && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold",
                    followUpState(lead.next_follow_up_at) === "overdue" ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground",
                  )}
                >
                  <CalendarClock className="size-3.5" />
                  {fmtFollowUp(lead.next_follow_up_at)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <QuickAction tone="call" href={lead.phone ? `tel:${lead.phone}` : undefined} icon={<Phone className="size-4" />} label="Call" />
          <QuickAction tone="whatsapp" href={wa ? waLink(wa) : undefined} icon={<WhatsAppIcon className="size-5" />} label="WhatsApp" external />
          <QuickAction tone="email" href={lead.email ? `mailto:${lead.email}` : undefined} icon={<Mail className="size-4" />} label="Email" />
        </div>
        <ConvertToClientButton leadId={lead.id} status={lead.status} />
        <div className="mt-3 grid grid-cols-3 rounded-full bg-muted p-1" role="tablist">
          {(["timeline", "details", "more"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "h-9 rounded-full text-[13px] font-semibold capitalize transition-all",
                tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div key={tab} className="flex min-h-0 flex-1 flex-col animate-fade-in">
        {tab === "timeline" && <TimelinePane lead={lead} />}
        {tab === "details" && <DetailsPane lead={lead} users={users} />}
        {tab === "more" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <LeadDetail lead={lead} users={users} onDeleted={onDeleted} />
          </div>
        )}
      </div>
    </div>
  );
}

type Channel = "call" | "whatsapp" | "email";

const CHANNEL_COLOR: Record<Channel, string> = {
  call: "var(--color-channel-call)",
  whatsapp: "var(--color-channel-whatsapp)",
  email: "var(--color-channel-email)",
};

function QuickAction({
  href,
  icon,
  label,
  external,
  tone,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  external?: boolean;
  tone: Channel;
}) {
  const cls = "flex h-11 items-center justify-center gap-2 rounded-md px-2 text-[13px] font-semibold transition-all active:scale-95";
  const c = CHANNEL_COLOR[tone];
  if (!href)
    return (
      <span className={cn(cls, "cursor-not-allowed border border-border bg-muted/50 text-muted-foreground/50")}>
        {icon}
        {label}
      </span>
    );
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className={cn(cls, "text-channel-foreground hover:brightness-110")}
      style={{
        background: c,
        boxShadow: `0 1px 3px color-mix(in oklab, ${c} 38%, transparent)`,
      }}
    >
      {icon}
      {label}
    </a>
  );
}

// ---------------- Timeline ----------------

function TimelinePane({ lead }: { lead: LeadRow }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listLeadActivities);
  const addFn = useServerFn(addLeadActivity);
  const [filter, setFilter] = useState<"updates" | "all">("all");
  const [text, setText] = useState("");
  const [myId, setMyId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, []);

  const key = ["leads", "activities", lead.id];
  const q = useQuery({ queryKey: key, queryFn: () => listFn({ data: { leadId: lead.id } }), staleTime: 5_000 });

  useEffect(() => {
    const ch = supabase
      .channel(`lead-acts-${lead.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lead_activities", filter: `lead_id=eq.${lead.id}` }, () =>
        qc.invalidateQueries({ queryKey: ["leads", "activities", lead.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [lead.id, qc]);

  const items = useMemo(() => {
    const rows = [...(q.data ?? [])].filter((a) => a.kind !== "viewed").reverse();
    return filter === "updates" ? rows.filter((a) => USER_KINDS.has(a.kind)) : rows;
  }, [q.data, filter]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items.length]);

  const addM = useMutation({
    mutationFn: (v: { kind: "update" | "proposal_sent" | "portfolio_shared" | "client_replied"; body: string }) =>
      addFn({ data: { leadId: lead.id, kind: v.kind, body: v.body } }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["leads", "list"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not post update"),
  });

  const send = () => {
    const body = text.trim();
    if (!body) return;
    addM.mutate({ kind: "update", body });
  };

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3 sm:px-5">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Activity</span>
        <div className="flex rounded-full bg-muted p-0.5 text-[12px] font-semibold">
          {(["all", "updates"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("h-7 rounded-full px-3 transition-all", filter === f ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
              {f === "all" ? "All activity" : "Updates only"}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5">
        {q.isLoading ? (
          <div className="grid gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={cn("h-14 w-2/3 animate-pulse rounded-2xl bg-muted", i % 2 && "ml-auto")} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="grid place-items-center py-16 text-center text-[13px] text-muted-foreground">
            No updates yet. Write the first one below.
          </div>
        ) : (
          <div className="grid gap-2">
            {items.map((a, i) => (
              <div key={a.id}>
                {(i === 0 || !sameDay(items[i - 1].created_at, a.created_at)) && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-muted px-3 py-1 text-[11.5px] font-semibold text-muted-foreground">{dayLabel(a.created_at)}</span>
                  </div>
                )}
                <TimelineItem a={a} mine={a.actor_id === myId} />
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-card px-3 pt-2 pb-safe sm:px-5">
        <div className="-mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
          {(
            [
              { kind: "client_replied", label: "Client replied" },
              { kind: "portfolio_shared", label: "Portfolio shared" },
              { kind: "proposal_sent", label: "Proposal sent" },
            ] as const
          ).map((c) => (
            <button
              key={c.kind}
              type="button"
              disabled={addM.isPending}
              onClick={() => addM.mutate({ kind: c.kind, body: text.trim() || c.label })}
              className="h-8 shrink-0 whitespace-nowrap rounded-full border border-border bg-background px-3 text-[12.5px] font-medium text-foreground transition-all active:scale-95 disabled:opacity-50"
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && window.innerWidth >= 768) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Write an update…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-[15px] text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="button"
            onClick={send}
            disabled={!text.trim() || addM.isPending}
            aria-label="Send update"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-all active:scale-90 disabled:opacity-40"
          >
            {addM.isPending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
          </button>
        </div>
      </div>
    </>
  );
}

function TimelineItem({ a, mine }: { a: LeadActivityRow; mine: boolean }) {
  const isUser = USER_KINDS.has(a.kind);
  if (!isUser) {
    return (
      <div className="flex animate-bubble-in justify-center">
        <div className="max-w-[88%] rounded-full border border-border bg-card px-3 py-1 text-center text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground">{a.actor_name ?? "System"}</span> · {a.body ?? a.kind}
          <span className="ml-1.5 font-mono text-[11px]">{fmtTime(a.created_at)}</span>
        </div>
      </div>
    );
  }
  const tag = KIND_LABEL[a.kind];
  return (
    <div className={cn("flex animate-bubble-in items-end gap-2", mine && "flex-row-reverse")}>
      <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[10px] font-bold text-foreground ring-1 ring-border">
        {a.actor_avatar_url ? (
          <img src={a.actor_avatar_url} alt="" className="size-full object-cover" />
        ) : a.actor_name ? (
          initialsOf(a.actor_name)
        ) : (
          <UserRound className="size-3.5" />
        )}
      </span>
      <div className={cn("max-w-[80%] sm:max-w-[70%]", mine && "text-right")}>
        <div className={cn("mb-0.5 text-[11.5px] text-muted-foreground", mine && "text-right")}>
          {a.actor_name ?? "Someone"} · {fmtTime(a.created_at)}
        </div>
        <div
          className={cn(
            "inline-block whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-left text-[14px] leading-snug",
            mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-card text-foreground",
          )}
        >
          {tag && <div className={cn("mb-0.5 text-[11px] font-bold uppercase tracking-wide", mine ? "opacity-80" : "text-primary")}>{tag}</div>}
          {a.body}
        </div>
      </div>
    </div>
  );
}

// ---------------- Details ----------------

function DetailsPane({ lead, users }: { lead: LeadRow; users: AssignableUser[] }) {
  const qc = useQueryClient();
  const updFn = useServerFn(updateLead);
  const permFn = useServerFn(getMyPermissions);
  const srcFn = useServerFn(listLeadSourceOptions);
  const svcFn = useServerFn(listLeadServiceOptions);
  const perms = useQuery({ queryKey: ["my-permissions"], queryFn: () => permFn(), staleTime: 60_000 }).data;
  const sources = useQuery({ queryKey: ["lead-source-options"], queryFn: () => srcFn(), initialData: SOURCE_FALLBACK, staleTime: 300_000 }).data;
  const services = useQuery({ queryKey: ["lead-service-options"], queryFn: () => svcFn(), initialData: SERVICE_FALLBACK, staleTime: 300_000 }).data;

  const init = () => {
    const fu = isoToBD(lead.next_follow_up_at);
    return {
      name: lead.name ?? "",
      company: lead.company ?? "",
      contact_person: lead.contact_person ?? "",
      phone: lead.phone ?? "",
      whatsapp: lead.whatsapp ?? "",
      source: lead.source ?? "",
      service: lead.service ?? "",
      requirement: lead.requirement ?? "",
      budget: lead.budget != null ? String(lead.budget) : lead.value_usd != null ? String(lead.value_usd) : "",
      currency: lead.currency ?? "BDT",
      timeline: lead.timeline ?? "",
      notes: lead.notes ?? "",
      priority: (lead.priority ?? "medium") as "low" | "medium" | "high" | "urgent",
      fuDate: fu.date,
      fuTime: fu.time,
      owner_id: lead.owner_id ?? "",
    };
  };
  const [f, setF] = useState(init);
  useEffect(() => setF(init()), [lead.id, lead.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify(init());

  const m = useMutation({
    mutationFn: () => {
      const base = init();
      const patch: Record<string, unknown> = {};
      const str = (k: keyof typeof f) => {
        if (f[k] !== base[k]) patch[k] = String(f[k]).trim() || null;
      };
      (["name", "company", "contact_person", "phone", "whatsapp", "source", "service", "requirement", "timeline", "notes"] as const).forEach(str);
      if (patch.name === null) throw new Error("Name is required");
      if (f.budget !== base.budget) {
        const n = f.budget.trim() ? Number(f.budget) : null;
        if (n != null && (isNaN(n) || n < 0)) throw new Error("Budget must be a number");
        patch.budget = n;
        patch.value_usd = n;
      }
      if (f.currency !== base.currency) patch.currency = f.currency;
      if (f.priority !== base.priority) patch.priority = f.priority;
      if (f.fuDate !== base.fuDate || f.fuTime !== base.fuTime) {
        patch.next_follow_up_at = f.fuDate ? bdToISO(f.fuDate, f.fuTime) : null;
      }
      if (f.owner_id !== base.owner_id) patch.owner_id = f.owner_id || null;
      return updFn({ data: { id: lead.id, patch: patch as never } });
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const inp = "h-11 w-full rounded-md border border-border bg-card px-3 text-[15px] text-foreground outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        <div className="grid gap-4">
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-[13px]">
            <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Created by</div>
            <div className="mt-1 font-semibold text-foreground">
              {lead.created_by_name ?? "—"}
              {lead.created_by_code && <span className="ml-2 font-mono text-[12px] text-primary">{lead.created_by_code}</span>}
            </div>
            <div className="text-muted-foreground">
              {new Date(lead.created_at).toLocaleString("en-US", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" })} (GMT+6)
            </div>
          </div>

          <Section title="Client">
            <L label="Lead / Client name"><input className={inp} value={f.name} onChange={(e) => set("name", e.target.value)} /></L>
            <L label="Company / Brand"><input className={inp} value={f.company} onChange={(e) => set("company", e.target.value)} /></L>
            <L label="Contact person"><input className={inp} value={f.contact_person} onChange={(e) => set("contact_person", e.target.value)} /></L>
            <L label="Mobile"><input className={inp} inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></L>
            <L label="WhatsApp"><input className={inp} inputMode="tel" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} /></L>
          </Section>

          <Section title="Requirement">
            <L label="Lead source">
              <select className={inp} value={f.source} onChange={(e) => set("source", e.target.value)}>
                <option value="">—</option>
                {sources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                {f.source && !sources.some((s) => s.key === f.source) && <option value={f.source}>{f.source}</option>}
              </select>
            </L>
            <L label="Interested service">
              <select className={inp} value={f.service} onChange={(e) => set("service", e.target.value)}>
                <option value="">—</option>
                {services.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                {f.service && !services.some((s) => s.key === f.service) && <option value={f.service}>{f.service}</option>}
              </select>
            </L>
            <L label="Project requirement" full><textarea className={cn(inp, "min-h-[90px] py-2.5")} value={f.requirement} onChange={(e) => set("requirement", e.target.value)} /></L>
            <L label="Approximate budget">
              <div className="flex gap-2">
                <input className={cn(inp, "font-mono")} inputMode="decimal" value={f.budget} onChange={(e) => set("budget", e.target.value)} />
                <select className={cn(inp, "w-24 shrink-0")} value={f.currency} onChange={(e) => set("currency", e.target.value as "BDT" | "USD")}>
                  <option>BDT</option>
                  <option>USD</option>
                </select>
              </div>
            </L>
            <L label="Expected timeline"><input className={inp} value={f.timeline} onChange={(e) => set("timeline", e.target.value)} /></L>
          </Section>

          <Section title="Follow-up">
            <L label="Priority" full>
              <div className="grid grid-cols-4 gap-1.5">
                {PRIORITY_OPTIONS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => set("priority", p.key)}
                    className={cn("h-10 rounded-md border text-[13px] font-semibold transition-all active:scale-95", f.priority === p.key ? "border-transparent text-primary-foreground" : "border-border bg-card text-foreground")}
                    style={f.priority === p.key ? { background: `var(${p.tone})` } : undefined}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </L>
            <L label="Next follow-up date"><input type="date" className={inp} value={f.fuDate} onChange={(e) => set("fuDate", e.target.value)} /></L>
            <L label="Time"><input type="time" className={inp} value={f.fuTime} onChange={(e) => set("fuTime", e.target.value)} disabled={!f.fuDate} /></L>
            <L label="Client notes" full><textarea className={cn(inp, "min-h-[90px] py-2.5")} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></L>
          </Section>

          {perms?.lead_assign && (
            <Section title="Ownership">
              <L label="Lead owner" full>
                <select className={inp} value={f.owner_id} onChange={(e) => set("owner_id", e.target.value)}>
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name ?? u.user_id.slice(0, 8)}</option>)}
                </select>
              </L>
            </Section>
          )}
        </div>
      </div>
      {dirty && (
        <div className="shrink-0 animate-sheet-up border-t border-border bg-card px-3 pt-3 pb-safe sm:px-5">
          <div className="flex gap-2">
            <button type="button" onClick={() => setF(init())} className="h-12 flex-1 rounded-md border border-border text-[14px] font-semibold text-foreground active:scale-[0.98]">
              Discard
            </button>
            <button
              type="button"
              onClick={() => m.mutate()}
              disabled={m.isPending}
              className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-md bg-primary text-[15px] font-bold text-primary-foreground active:scale-[0.98] disabled:opacity-60"
            >
              {m.isPending && <Loader2 className="size-4 animate-spin" />}
              Save changes
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function L({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("grid gap-1.5", full && "sm:col-span-2")}>
      <span className="text-[13px] font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}
