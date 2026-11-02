import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Globe, Loader2, Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import { RequireSuperAdmin } from "@/components/branta/require-super-admin";
import { CompanyAvatar, PersonChip } from "@/components/company/company-avatar";
import { Button } from "@/components/ui/button";
import { getCompany } from "@/lib/companies.functions";
import { companyAccent, setActiveCompanySlug } from "@/lib/active-company";

export const Route = createFileRoute("/_authenticated/app/companies/$slug")({
  head: () => ({
    meta: [
      { title: "Company profile · Branta Tech Group" },
      { name: "description", content: "Company profile, leadership and members." },
      { property: "og:title", content: "Company profile · Branta Tech Group" },
      { property: "og:description", content: "Company profile, leadership and members." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RequireSuperAdmin>
      <CompanyProfile />
    </RequireSuperAdmin>
  ),
});

function CompanyProfile() {
  const { slug } = Route.useParams();
  const fn = useServerFn(getCompany);
  const q = useQuery({ queryKey: ["company", slug], queryFn: () => fn({ data: { slug } }) });
  if (q.isLoading) return <div className="grid h-full place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  const c = q.data;
  if (!c) return <div className="p-8 text-[13px] font-semibold text-muted-foreground">Company not found.</div>;
  const accent = companyAccent(c.slug);
  const info = [
    { icon: Mail, label: "Email", value: c.email, href: `mailto:${c.email}` },
    { icon: Phone, label: "Phone", value: c.phone, href: c.phone ? `tel:${c.phone}` : undefined },
    { icon: Globe, label: "Website", value: c.website_url, href: c.website_url ?? undefined },
    { icon: MapPin, label: "Address", value: c.address },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <Link to="/app/companies" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-3.5" /> All companies
      </Link>

      <section className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm animate-in fade-in slide-in-from-bottom-2">
        <span className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full blur-3xl" style={{ background: `color-mix(in oklab, ${accent} 18%, transparent)` }} />
        <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
        <div className="relative flex flex-wrap items-center gap-4">
          <CompanyAvatar name={c.name} slug={c.slug} className="size-16 rounded-xl text-[20px]" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[24px] font-bold tracking-tight">{c.name}</h1>
              {c.is_holding && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">Holding</span>}
            </div>
            <div className="mt-0.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-status-converted">
              <span className="size-1.5 rounded-full bg-status-converted" /> {c.status === "active" ? "Active" : c.status}
            </div>
          </div>
          <Button onClick={() => setActiveCompanySlug(c.slug)} className="shadow-md shadow-brand/25 transition-all hover:-translate-y-0.5 active:scale-95">
            Open workspace
          </Button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Company info</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {info.map((r) => (
              <div key={r.label} className="group flex items-start gap-3 rounded-md border border-border p-3 transition-all hover:border-brand/40 hover:shadow-sm">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-brand/10 group-hover:text-brand">
                  <r.icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{r.label}</div>
                  {r.value ? (
                    r.href ? <a href={r.href} target={r.label === "Website" ? "_blank" : undefined} rel="noreferrer" className="block break-words text-[13px] font-semibold hover:text-brand">{r.value}</a>
                      : <div className="break-words text-[13px] font-semibold">{r.value}</div>
                  ) : <div className="text-[13px] font-semibold text-muted-foreground">N/A</div>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Leadership</h2>
          <div className="space-y-2">
            {[["CEO", c.ceo], ["COO", c.coo]].map(([role, p]) => (
              <div key={role as string} className="flex items-center justify-between rounded-md border border-border p-3">
                <PersonChip name={(p as typeof c.ceo)?.full_name ?? "Not assigned"} avatar={(p as typeof c.ceo)?.avatar_url} role={role as string} />
                {p && <span className="inline-flex items-center gap-1 rounded-full bg-status-converted/10 px-2 py-0.5 text-[10px] font-bold text-status-converted"><ShieldCheck className="size-3" /> Super admin</span>}
              </div>
            ))}
          </div>
          <div className="mt-4 text-[11.5px] font-semibold text-muted-foreground">{c.members.length} member{c.members.length === 1 ? "" : "s"} with access</div>
        </section>
      </div>
    </div>
  );
}
