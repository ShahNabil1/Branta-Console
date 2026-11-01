// Employee mail delivery history from real Brevo events (email_events), with
// plain-language reasons and an Unblock action when Brevo blocks an address.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, Eye, Loader2, Mail, MousePointerClick, RefreshCw, Send, ShieldOff, Unlock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { syncRecentEmailEvents, unblockEmployeeMail } from "@/lib/employees.functions";
import { cn } from "@/lib/utils";

interface Ev { id: string; event: string; email: string; subject: string | null; reason: string | null; message_id: string | null; occurred_at: string }

export const MAIL_LABEL: Record<string, string> = {
  sent: "Sent", delivered: "Delivered", opened: "Opened", clicked: "Link clicked", deferred: "Delayed",
  soft_bounce: "Soft bounce", hard_bounce: "Bounced", blocked: "Blocked by Brevo", spam: "Marked as spam",
  invalid_email: "Invalid address", error: "Send error", unsubscribed: "Unsubscribed", unblocked: "Unblocked",
};
const EXPLAIN: Record<string, string> = {
  deferred: "The receiving mail server asked Brevo to try again later. Brevo retries automatically — usually it arrives within minutes.",
  soft_bounce: "Temporary problem at the receiver (mailbox full, server busy). Brevo will retry; if it repeats, check the mailbox.",
  hard_bounce: "The address does not exist or permanently refused mail. Brevo then blocks it. Check the address, Unblock, then resend.",
  blocked: "Brevo stopped sending to this address because of an earlier bounce or spam report. Press Unblock, then resend.",
  spam: "The recipient (or their mail provider) reported this mail as spam, so Brevo blocks further mail. Unblock only if this was a mistake.",
  invalid_email: "The address format is not valid, so it was never sent. Fix the email address.",
  error: "Brevo could not process the message. Retry; if it repeats, check the Brevo account.",
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
        .select("id, event, email, subject, reason, message_id, occurred_at")
        .in("email", list).order("occurred_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as Ev[];
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

  const unblock = useMutation({
    mutationFn: (email: string) => unblockFn({ data: { email } }),
    onSuccess: (r, email) => {
      toast.success(r.wasBlocked ? `${email} unblocked on Brevo` : `${email} was not blocked on Brevo`, {
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
          <RefreshCw className={cn("size-3", q.isFetching && "animate-spin")} /> Refresh from Brevo
        </button>
      </div>
      <p className="mb-3 text-[11.5px] text-muted-foreground">Live from Brevo for {list.join(" · ")}. Updates every 30 seconds.</p>

      {blockedEmail && (
        <div className="mb-3 flex flex-col gap-2 rounded-sm border border-rose-300 bg-rose-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 text-[12px] text-rose-800">
            <ShieldOff className="mt-0.5 size-4 shrink-0" />
            <div><b>{MAIL_LABEL[latestBad!.event] ?? latestBad!.event}</b> — {blockedEmail}<div className="mt-0.5">{EXPLAIN[latestBad!.event]}</div>{latestBad!.reason && <div className="mt-0.5 font-mono text-[11px]">Brevo says: {latestBad!.reason}</div>}</div>
          </div>
          <button type="button" disabled={unblock.isPending} onClick={() => unblock.mutate(blockedEmail)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm bg-brand px-3 text-[12px] font-semibold text-primary-foreground hover:bg-brand-700 disabled:opacity-60">
            {unblock.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Unlock className="size-3.5" />} Unblock on Brevo
          </button>
        </div>
      )}

      {q.isLoading ? (
        <div className="flex items-center gap-2 py-6 text-[12px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Loading mail history from Brevo…</div>
      ) : q.isError ? (
        <div className="py-4 text-[12px] text-rose-600">Could not read mail history: {q.error instanceof Error ? q.error.message : String(q.error)}</div>
      ) : messages.length === 0 ? (
        <div className="py-6 text-[12px] text-muted-foreground">No mail recorded for this employee yet. Welcome and password-reset mails appear here once Brevo reports them.</div>
      ) : (
        <ul className="space-y-3">
          {messages.map((evs) => {
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
                {problem && (
                  <div className={cn("mt-2 flex gap-1.5 rounded-sm border px-2 py-1.5 text-[11.5px]", mailTone(problem.event))}>
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <div><b>{MAIL_LABEL[problem.event] ?? problem.event}</b> · {fmt(problem.occurred_at)} — {EXPLAIN[problem.event] ?? "Brevo reported a problem."}{problem.reason && <div className="font-mono text-[10.5px]">Brevo says: {problem.reason}</div>}</div>
                  </div>
                )}
                <details className="mt-2 text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer select-none">All events ({evs.length})</summary>
                  <ul className="mt-1 space-y-0.5 font-mono">
                    {evs.map((e) => <li key={e.id}>{fmt(e.occurred_at)} · {MAIL_LABEL[e.event] ?? e.event}{e.reason ? ` · ${e.reason}` : ""}</li>)}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
