import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { Calendar, Inbox, Mail, Sparkles, TrendingUp, Users, Video } from "lucide-react";
import { getCompanyOverview } from "@/lib/company-overview.functions";
import { CompanyAvatar } from "./company-avatar";
import { companyAccent } from "@/lib/active-company";
import { Skeleton } from "@/components/ui/skeleton";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Dhaka" }).format(new Date()));
  return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
}

export function CompanyOverview({ slug, name }: { slug: string; name: string }) {
  const fn = useServerFn(getCompanyOverview);
  const q = useQuery({ queryKey: ["company-overview", slug], queryFn: () => fn({ data: { company: slug } }), staleTime: 30_000 });
  const accent = companyAccent(slug);
  const d = q.data;
  const tiles = [
    { label: "New leads · 30d", value: d?.kpis.newLeads30d, icon: TrendingUp, color: "var(--color-brand)" },
    { label: "Open leads", value: d?.kpis.openLeads, icon: Users, color: "var(--color-status-converted)" },
    { label: "Meetings today", value: d?.kpis.meetingsToday, icon: Calendar, color: "var(--color-status-contacted, var(--color-brand))" },
    { label: "Unread mail", value: d?.kpis.unreadInbox, icon: Mail, color: accent },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-6">
      <header className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm animate-in fade-in slide-in-from-top-2">
        <span className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full blur-3xl" style={{ background: `color-mix(in oklab, ${accent} 22%, transparent)` }} />
        <div className="relative flex flex-wrap items-center gap-4">
          <CompanyAvatar name={name} slug={slug} className="size-12 rounded-xl text-[16px]" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-muted-foreground">{greeting()}</p>
            <h1 className="text-[20px] font-bold tracking-tight">{name} workspace</h1>
          </div>
          <Link to="/app/inbox" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-[12.5px] font-bold text-primary-foreground shadow-md shadow-brand/25 transition-all hover:-translate-y-0.5 active:scale-95">
            <Inbox className="size-4" /> Open Inbox
          </Link>
        </div>
      </header>

      {q.error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-[12.5px] font-medium text-destructive">{(q.error as Error).message}</div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t, i) => (
          <div key={t.label} style={{ animationDelay: `${i * 60}ms` }}
            className="group relative overflow-hidden rounded-lg border border-border bg-card p-4 transition-all animate-in fade-in slide-in-from-bottom-2 fill-mode-both hover:-translate-y-0.5 hover:shadow-md">
            <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: t.color }} />
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-muted-foreground">{t.label}</span>
              <t.icon className="size-4 transition-transform group-hover:scale-110" style={{ color: t.color }} />
            </div>
            <div className="mt-2 font-mono text-[24px] font-bold tabular-nums">{q.isLoading ? <Skeleton className="h-7 w-12" /> : t.value ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Upcoming meetings" icon={Calendar} loading={q.isLoading} empty={!d?.upcoming.length} emptyText="No upcoming meetings.">
          {d?.upcoming.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/60">
              <div className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-center leading-none">
                <span className="font-mono text-[13px] font-bold">{format(new Date(m.starts_at), "d")}</span>
                <span className="text-[9px] font-bold uppercase text-muted-foreground">{format(new Date(m.starts_at), "MMM")}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold">{m.title}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{format(new Date(m.starts_at), "h:mm a")}</p>
              </div>
              {m.meeting_link && (
                <a href={m.meeting_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-bold transition-all hover:border-brand/40 active:scale-95">
                  <Video className="size-3.5" /> Join
                </a>
              )}
            </li>
          ))}
        </Panel>

        <Panel title="Latest mail" icon={Mail} loading={q.isLoading} empty={!d?.inbox.length} emptyText="No mail yet.">
          {d?.inbox.map((m) => (
            <li key={m.id}>
              <Link to="/app/inbox" className="flex items-start gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/60">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: m.unread ? accent : "transparent" }} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[12.5px] ${m.unread ? "font-bold" : "font-medium"}`}>{m.from}</p>
                  <p className="truncate text-[11.5px] text-muted-foreground">{m.subject}</p>
                </div>
                <span className="shrink-0 text-[10.5px] text-muted-foreground">{formatDistanceToNow(new Date(m.received_at), { addSuffix: true })}</span>
              </Link>
            </li>
          ))}
        </Panel>

        <Panel title="Recent leads" icon={Sparkles} loading={q.isLoading} empty={!d?.recentLeads.length} emptyText="No leads yet for this company.">
          {d?.recentLeads.map((l) => (
            <li key={l.id} className="flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/60">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold">{l.name}</p>
                <p className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}</p>
              </div>
              <span className="rounded-full border border-border px-2 py-0.5 text-[10.5px] font-bold capitalize">{l.status.replace(/_/g, " ")}</span>
            </li>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, loading, empty, emptyText, children }: {
  title: string; icon: typeof Mail; loading: boolean; empty: boolean; emptyText: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-3 animate-in fade-in slide-in-from-bottom-2">
      <h2 className="mb-2 flex items-center gap-1.5 px-2 text-[12.5px] font-bold"><Icon className="size-4 text-brand" /> {title}</h2>
      {loading ? (
        <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : empty ? (
        <p className="px-2 py-6 text-center text-[12px] font-medium text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-0.5">{children}</ul>
      )}
    </section>
  );
}
