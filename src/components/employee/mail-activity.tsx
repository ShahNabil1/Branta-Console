// Employee mail delivery history from real Brevo events (email_events), with
// plain-language reasons and an Unblock action when Brevo blocks an address.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Eye, Loader2, Mail, MousePointerClick, RefreshCw, Send, ShieldOff, Unlock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { syncRecentEmailEvents, unblockEmployeeMail } from "@/lib/employees.functions";
import { cn } from "@/lib/utils";

interface Ev { id: string; event: string; email: string; subject: string | null; reason: string | null; message_id: string | null; occurred_at: string; raw?: { by_name?: string; by?: string } | null }

export const MAIL_LABEL: Record<string, string> = {
  sent: "Sent", delivered: "Delivered", opened: "Opened", clicked: "Link clicked", deferred: "Delayed",
  soft_bounce: "Soft bounce", hard_bounce: "Bounced", blocked: "Blocked by mail service", spam: "Marked as spam",
  invalid_email: "Invalid address", error: "Send error", unsubscribed: "Unsubscribed", unblocked: "Unblocked",
};
const EXPLAIN: Record<string, string> = {
  deferred: "The receiving mail server asked the mail service to try again later. the mail service retries automatically — usually it arrives within minutes.",
  soft_bounce: "Temporary problem at the receiver (mailbox full, server busy). the mail service will retry; if it repeats, check the mailbox.",
  hard_bounce: "The address does not exist or permanently refused mail. the mail service then blocks it. Check the address, Unblock, then resend.",
  blocked: "the mail service stopped sending to this address because of an earlier bounce or spam report. Press Unblock, then resend.",
  spam: "The recipient (or their mail provider) reported this mail as spam, so the mail service blocks further mail. Unblock only if this was a mistake.",
  invalid_email: "The address format is not valid, so it was never sent. Fix the email address.",
  error: "the mail service could not process the message. Retry; if it repeats, check the mail service settings.",
  unsubscribed: "The recipient unsubscribed. Transactional mail may be blocked until unblocked.",
};
const BAD = new Set(["hard_bounce", "blocked", "spam", "invalid_email", "error", "unsubscribed"]);
const WARN = new Set(["deferred", "soft_bounce"]);
const STAGES = [
  { key: "sent", label: "Sent", icon: Send },
  { key: "delivered", label: "Delivered", icon: Check },
  { key: "opened", label: "Opened", icon: Eye },
  { key: "clicked", label: "Clicked", icon: MousePointerClick },
] as const;
const RANK: Record<string, number> = { sent: 0, delivered: 1, opened: 2, clicked: 3 };

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function mailTone(ev?: string) {
  if (!ev) return "border-border bg-muted text-muted-foreground";
  if (BAD.has(ev)) return "border-rose-300 bg-rose-50 text-rose-700";
  if (WARN.has(ev)) return "border-amber-300 bg-amber-50 text-amber-700";
  if (ev === "opened" || ev === "clicked") return "border-sky-300 bg-sky-50 text-sky-700";
  if (ev === "delivered" || ev === "unblocked") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  return "border-border bg-muted text-muted-foreground";
}

export function MailActivity({ emails }: { emails: string[] }) {
  const qc = useQueryClient();
  const syncFn = useServerFn(syncRecentEmailEvents);
  const unblockFn = useServerFn(unblockEmployeeMail);
  const list = useMemo(() => Array.from(new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))), [emails]);
  const q = useQuery({
    queryKey: ["mail-activity", list],
    enabled: list.length > 0,
    refetchInterval: 30_000,
    queryFn: async () => {
      try { await syncFn(); } catch (e) { console.error("[mail-activity] Brevo sync failed", e); }
      const { data, error } = await supabase.from("email_events")
        .select("id, event, email, subject, reason, message_id, occurred_at, raw")
        .in("email", list).order("occurred_at", { ascending: false }).limit(200);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Ev[];
      const ids = [...new Set(rows.filter((r) => r.event === "unblocked" && r.raw?.by && !r.raw.by_name).map((r) => r.raw!.by!))];
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
        const nm = new Map((ps ?? []).map((p: any) => [p.id, p.full_name || p.email]));
        rows.forEach((r) => { if (r.raw?.by && !r.raw.by_name) r.raw.by_name = nm.get(r.raw.by) ?? undefined; });
      }
      return rows;
    },
  });

  // One card per message: its full pipeline.
  const messages = useMemo(() => {
    const m = new Map<string, Ev[]>();
    for (const e of q.data ?? []) {
      if (e.event === "unblocked") continue;
      const k = e.message_id ?? `${e.email}|${e.subject ?? ""}|${e.occurred_at.slice(0, 13)}`;
      (m.get(k) ?? m.set(k, []).get(k)!).push(e);
    }
    return Array.from(m.values()).map((evs) => evs.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)));
  }, [q.data]);
  const latestBad = (q.data ?? []).find((e) => BAD.has(e.event));
  const cleared = (e: Ev) => (q.data ?? []).some((x) => x.email === e.email && (x.event === "delivered" || x.event === "unblocked") && x.occurred_at > e.occurred_at);
  const blockedEmail = latestBad && !cleared(latestBad) ? latestBad.email : null;
  const unblocks = (q.data ?? []).filter((e) => e.event === "unblocked");
  const lastUnblock = unblocks[0];

  const [shown, setShown] = useState(5);
  const unblock = useMutation({
    mutationFn: (email: string) => unblockFn({ data: { email } }),
    onSuccess: (r, email) => {
      toast.success(r.wasBlocked ? `${email} unblocked ` : `${email} was not blocked `, {
        description: "New mail to this address can be delivered now. Resend the onboarding or reset mail to retry.",
      });
      qc.invalidateQueries({ queryKey: ["mail-activity"] });
    },
    onError: (e) => toast.error("Unblock failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <section className="rounded-sm border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-brand" strokeWidth={2} />
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Mail delivery history</h2>
        </div>
        <button type="button" onClick={() => q.refetch()} className="inline-flex h-7 items-center gap-1 rounded-sm border border-border px-2 text-[11px] font-semibold hover:bg-muted">
          <RefreshCw className={cn("size-3", q.isFetching && "animate-spin")} /> Refresh 
        </button>
      </div>
      <p className="mb-3 text-[11.5px] text-muted-foreground">Live  for {list.join(" · ")}. Updates every 30 seconds.</p>

      {blockedEmail && (
        <div className="mb-3 flex flex-col gap-2 rounded-sm border border-rose-300 bg-rose-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 text-[12px] text-rose-800">
            <ShieldOff className="mt-0.5 size-4 shrink-0" />
            <div><b>{MAIL_LABEL[latestBad!.event] ?? latestBad!.event}</b> — {blockedEmail}<div className="mt-0.5">{EXPLAIN[latestBad!.event]}</div>{latestBad!.reason && <div className="mt-0.5 font-mono text-[11px]">Provider says: {latestBad!.reason}</div>}</div>
          </div>
          <button type="button" disabled={unblock.isPending} onClick={() => unblock.mutate(blockedEmail)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm bg-brand px-3 text-[12px] font-semibold text-primary-foreground hover:bg-brand-700 disabled:opacity-60">
            {unblock.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Unlock className="size-3.5" />} Unblock 
          </button>
        </div>
      )}
      {!blockedEmail && lastUnblock && (
        <div className="mb-3 rounded-sm border border-emerald-300 bg-emerald-50 p-3 text-[12px] text-emerald-800">
          <div className="flex gap-2"><Unlock className="mt-0.5 size-4 shrink-0" /><div><b>Not blocked — ready for mail</b> · {lastUnblock.email}<div className="mt-0.5">the mail service can deliver to this address now. Resend the onboarding or reset mail if an earlier one failed.</div></div></div>
          <details className="mt-2 text-[11px]"><summary className="cursor-pointer select-none font-semibold">Block / unblock history ({unblocks.length})</summary>
            <ul className="mt-1 space-y-0.5 font-mono">
              {(q.data ?? []).filter((e) => e.event === "unblocked" || BAD.has(e.event)).map((e) => <li key={e.id}>{fmt(e.occurred_at)} · {e.email} · {MAIL_LABEL[e.event] ?? e.event}{e.event === "unblocked" && e.raw?.by_name ? <b className="font-sans"> · by {e.raw.by_name}</b> : null}{e.reason ? ` · ${e.reason.replace(/the mail service/g, "Mail provider")}` : ""}</li>)}
            </ul>
          </details>
        </div>
      )}


      {q.isLoading ? (
        <div className="flex items-center gap-2 py-6 text-[12px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Loading mail history …</div>
      ) : q.isError ? (
        <div className="py-4 text-[12px] text-rose-600">Could not read mail history: {q.error instanceof Error ? q.error.message : String(q.error)}</div>
      ) : messages.length === 0 ? (
        <div className="py-6 text-[12px] text-muted-foreground">No mail recorded for this employee yet. Welcome and password-reset mails appear here once the mail service reports them.</div>
      ) : (
        <ul className="space-y-3">
          {messages.slice(0, shown).map((evs) => {
            const first = evs[0]!;
            const top = Math.max(...evs.map((e) => RANK[e.event] ?? -1));
            const problem = [...evs].reverse().find((e) => BAD.has(e.event) || WARN.has(e.event));
            const at = (k: string) => evs.find((e) => e.event === k)?.occurred_at;
            return (
              <li key={first.id} className="rounded-sm border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <div className="min-w-0 truncate text-[12.5px] font-semibold">{first.subject ?? "(no subject)"}</div>
                  <span className="font-mono text-[10.5px] text-muted-foreground">to {first.email}</span>
                </div>
                <ol className="mt-3 grid grid-cols-4 gap-1">
                  {STAGES.map((s, i) => {
                    const reached = top >= i;
                    const t = at(s.key) ?? (reached && s.key === "delivered" ? undefined : undefined);
                    return (
                      <li key={s.key} className="min-w-0">
                        <div className={cn("h-1 rounded-full", reached ? (problem && BAD.has(problem.event) ? "bg-rose-400" : "bg-emerald-500") : "bg-muted")} />
                        <div className={cn("mt-1 flex items-center gap-1 text-[11px] font-semibold", reached ? "text-foreground" : "text-muted-foreground/60")}>
                          <s.icon className="size-3" /> {s.label}
                        </div>
                        <div className="truncate font-mono text-[10px] text-muted-foreground">{t ? fmt(t) : reached ? "confirmed" : "—"}</div>
                      </li>
                    );
                  })}
                </ol>
                {problem && (() => {
                  const fix = BAD.has(problem.event) ? unblocks.filter((u) => u.email === problem.email && u.occurred_at > problem.occurred_at).at(-1) : undefined;
                  return (
                    <div className={cn("mt-2 rounded-sm border px-2 py-1.5 text-[11.5px]", fix ? "border-border bg-muted/40 text-muted-foreground" : mailTone(problem.event))}>
                      <div className="flex gap-1.5">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        <div><b>{fix ? "Earlier: " : ""}{MAIL_LABEL[problem.event] ?? problem.event}</b> · {fmt(problem.occurred_at)} — {fix ? "This was the problem at that time." : EXPLAIN[problem.event] ?? "the mail service reported a problem."}{problem.reason && <div className="font-mono text-[10.5px]">Provider says: {problem.reason}</div>}</div>
                      </div>
                      {fix && <div className="mt-1 flex gap-1.5 font-semibold text-emerald-700"><Check className="mt-0.5 size-3.5 shrink-0" /> Resolved · unblocked on {fmt(fix.occurred_at)}. Resend to deliver it now.</div>}
                    </div>
                  );
                })()}
                <details className="mt-2 text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer select-none">All events ({evs.length})</summary>
                  <ul className="mt-1 space-y-0.5 font-mono">
                    {evs.map((e) => <li key={e.id}>{fmt(e.occurred_at)} · {MAIL_LABEL[e.event] ?? e.event}{e.event === "unblocked" && e.raw?.by_name ? <b className="font-sans"> · by {e.raw.by_name}</b> : null}{e.reason ? ` · ${e.reason.replace(/the mail service/g, "Mail provider")}` : ""}</li>)}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {messages.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + 5)} className="mt-3 h-8 w-full rounded-sm border border-border text-[12px] font-semibold hover:bg-muted">
          View more ({messages.length - shown} older)
        </button>
      )}
    </section>
  );
}
