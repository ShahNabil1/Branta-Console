import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowUpRight, Building2, Crown, Globe, Plus, Search, Users } from "lucide-react";
import { RequireSuperAdmin } from "@/components/branta/require-super-admin";
import { CreateCompanyWizard } from "@/components/company/create-company-wizard";
import { CompanyAvatar, PersonChip } from "@/components/company/company-avatar";
import { useCompanies } from "@/components/company/company-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { companyAccent, setActiveCompanySlug } from "@/lib/active-company";
import { companyIdentity } from "@/lib/company-identity";

export const Route = createFileRoute("/_authenticated/app/companies/")({
  validateSearch: z.object({ create: z.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "Companies · Branta Tech Group" },
      { name: "description", content: "Create and manage the sister concerns of Branta Tech Group." },
      { property: "og:title", content: "Companies · Branta Tech Group" },
      { property: "og:description", content: "Create and manage the sister concerns of Branta Tech Group." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireSuperAdmin>
      <CompaniesPage />
    </RequireSuperAdmin>
  ),
});

function CompaniesPage() {
  const { create } = Route.useSearch();
  const navigate = useNavigate();
  const q = useCompanies();
  const [term, setTerm] = useState("");
  const list = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (q.data ?? []).filter((c) => !c.is_holding && (!t || `${c.name} ${c.email}`.toLowerCase().includes(t)));
  }, [q.data, term]);
  const all = (q.data ?? []).filter((c) => !c.is_holding);
  const stats = [
    { label: "Companies", value: all.length, icon: Building2, color: "var(--color-brand)" },
    { label: "Active", value: all.filter((c) => c.status === "active").length, icon: Globe, color: "var(--color-status-converted)" },
    { label: "Leaders", value: new Set(all.flatMap((c) => [c.ceo_user_id, c.coo_user_id]).filter(Boolean)).size, icon: Crown, color: "var(--color-status-viewed)" },
    { label: "Memberships", value: all.reduce((s, c) => s + c.memberCount, 0), icon: Users, color: "var(--color-status-new)" },
  ];
  const setOpen = (o: boolean) => navigate({ to: "/app/companies", search: o ? { create: true } : {}, replace: true });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-brand">Branta Tech Group</div>
          <h1 className="mt-1 text-[24px] font-bold tracking-tight">Companies</h1>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-1.5 shadow-md shadow-brand/25 transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-95">
          <Plus className="size-4" /> Create company
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="group relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
            <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: s.color }} />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{s.label}</span>
              <span className="grid size-7 place-items-center rounded-md transition-transform group-hover:scale-110 group-hover:rotate-6" style={{ background: `color-mix(in oklab, ${s.color} 14%, transparent)`, color: s.color }}>
                <s.icon className="size-4" />
              </span>
            </div>
            <div className="mt-2 font-mono text-[24px] font-bold">{q.isLoading ? "–" : s.value}</div>
          </div>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search companies…" className="h-10 pl-9 text-[13px] font-medium" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {q.isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
        {list.map((c, i) => {
          const accent = companyAccent(c.slug);
          return (
            <Link
              key={c.id}
              to="/app/companies/$slug"
              params={{ slug: c.slug }}
              style={{ animationDelay: `${i * 50}ms` }}
              className="group relative overflow-hidden rounded-lg border border-border bg-card p-5 shadow-sm transition-all duration-200 animate-in fade-in slide-in-from-bottom-2 fill-mode-both hover:-translate-y-1 hover:border-transparent hover:shadow-xl active:scale-[0.99]"
            >
              <span className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" style={{ background: `color-mix(in oklab, ${accent} 25%, transparent)` }} />
              <span className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100" style={{ background: accent }} />
              <div className="relative flex items-start gap-3">
                <CompanyAvatar name={c.name} slug={c.slug} iconUrl={companyIdentity(c.slug, c).icon} className="size-11 text-[14px] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-bold">{c.name}</span>
                    {c.is_holding && <span className="rounded-full bg-brand/10 px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wider text-brand">Holding</span>}
                  </div>
                  <div className="truncate font-mono text-[11.5px] text-muted-foreground">{c.email}</div>
                </div>
                <ArrowUpRight className="size-4 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <div className="relative mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-md bg-muted/60 p-2"><PersonChip name={c.ceo?.full_name} avatar={c.ceo?.avatar_url} role="CEO" /></div>
                <div className="rounded-md bg-muted/60 p-2"><PersonChip name={c.coo?.full_name} avatar={c.coo?.avatar_url} role="COO" /></div>
              </div>
              <div className="relative mt-3 flex items-center justify-between text-[11.5px] font-semibold text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-status-converted shadow-[0_0_0_3px] shadow-status-converted/20" /> {c.status === "active" ? "Active" : c.status}
                </span>
                <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {c.memberCount}</span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setActiveCompanySlug(c.slug); }}
                  className="rounded-full border border-border px-2 py-0.5 font-bold text-foreground transition-all hover:border-brand hover:bg-brand hover:text-primary-foreground active:scale-90"
                >
                  Switch
                </button>
              </div>
            </Link>
          );
        })}
        {!q.isLoading && list.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-border p-10 text-center text-[13px] font-semibold text-muted-foreground">
            No companies match “{term}”.
          </div>
        )}
      </div>

      <CreateCompanyWizard open={!!create} onOpenChange={setOpen} onCreated={(slug) => navigate({ to: "/app/companies/$slug", params: { slug } })} />
    </div>
  );
}
