import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, Building2, Loader2, Mail, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCustomerByCode } from "@/lib/customers.functions";
import { getLeadBySlug, listAssignableUsers, logLeadView } from "@/lib/leads.functions";
import { LeadDetail } from "@/components/leads/lead-detail";
import { ClientProjects } from "@/components/clients/client-projects";
import { ClientTasks } from "@/components/clients/client-tasks";
import { WhatsAppIcon } from "@/components/social/whatsapp-icon";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/customers/$code")({
  component: CustomerDetailPage,
  head: ({ params }) => ({
    meta: [
      { title: `Customer ${params.code} · Branta Tech Console` },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function CustomerDetailPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const getCustomer = useServerFn(getCustomerByCode);
  const getLead = useServerFn(getLeadBySlug);
  const listUsers = useServerFn(listAssignableUsers);
  const logView = useServerFn(logLeadView);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"projects" | "tasks" | "profile" | "activity" | "crm">("projects");

  const customerQ = useQuery({
    queryKey: ["customers", "by-code", code],
    queryFn: () => getCustomer({ data: { code } }),
    staleTime: 15_000,
  });

  const leadSlug = customerQ.data?.leadSlug ?? null;

  const leadQ = useQuery({
    queryKey: ["leads", "by-slug", leadSlug ?? "__none__"],
    queryFn: () => getLead({ data: { slug: leadSlug as string } }),
    enabled: !!leadSlug,
    staleTime: 10_000,
  });

  const usersQ = useQuery({
    queryKey: ["leads", "assignable-users"],
    queryFn: () => listUsers(),
    staleTime: 60_000,
  });

  // Realtime — same subscription pattern as lead detail.
  useEffect(() => {
    const leadId = leadQ.data?.id;
    if (!leadId) return;
    const ch = supabase
      .channel(`customer-lead-${leadId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `id=eq.${leadId}` },
        () => leadQ.refetch(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_contacts",
          filter: `lead_id=eq.${leadId}`,
        },
        () => leadQ.refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [leadQ]);

  // Log a "viewed" activity when opening the customer (mirrors lead detail).
  useEffect(() => {
    const leadId = leadQ.data?.id;
    if (!leadId) return;
    logView({ data: { leadId } })
      .then((res) => {
        if (res?.logged) {
          qc.invalidateQueries({ queryKey: ["leads", "activities", leadId] });
        }
      })
      .catch(() => {});
  }, [leadQ.data?.id, logView, qc]);


  if (customerQ.isLoading || (leadSlug && leadQ.isLoading)) {
    return (
      <div className="grid h-full place-items-center p-16 text-[12.5px] text-muted-foreground">
        <Loader2 className="mb-2 size-5 animate-spin" />
        Loading customer…
      </div>
    );
  }

  if (customerQ.isError || !customerQ.data) {
    return (
      <div className="mx-auto grid max-w-md gap-3 p-10 text-center">
        <div className="text-[15px] font-semibold text-foreground">
          Customer not found
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          No customer matches <span className="font-mono">{code}</span>.
        </p>
        <Link
          to="/app/customers"
          className="mx-auto rounded-sm border border-border px-3 py-1.5 text-[12.5px] hover:bg-muted"
        >
          Back to customers
        </Link>
      </div>
    );
  }

  const { customer } = customerQ.data;
  const c = customer as typeof customer & { contact_person?: string | null; whatsapp?: string | null; client_since?: string | null };
  const users = usersQ.data ?? [];
  const manager = users.find((u) => u.user_id === c.owner_id)?.full_name ?? null;
  const wa = c.whatsapp || c.phone;

  return (
    <div className="flex h-full flex-col">
      <header className="hairline-b bg-card px-4 pb-3 pt-3">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate({ to: "/app/customers" })}
            className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"
            aria-label="Back to clients"
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-[15px] font-bold text-primary">
            {(c.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[17px] font-bold text-foreground">{c.name}</h1>
              <span className="shrink-0 font-mono text-[11.5px] font-semibold text-primary">{c.customer_code}</span>
            </div>
            <div className="truncate text-[13px] text-muted-foreground">
              <Building2 className="mr-1 inline size-3.5" />{c.company || "—"}
            </div>
          </div>
          {leadSlug && (
            <Link to="/app/leads/$slug" params={{ slug: leadSlug }} className="hidden font-mono text-[11px] text-muted-foreground hover:text-foreground sm:block">
              source: {leadSlug}
            </Link>
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Chan href={c.phone ? `tel:${c.phone}` : undefined} color="var(--color-channel-call)" icon={<Phone className="size-4" />} label="Call" />
          <Chan href={wa ? `https://wa.me/${wa.replace(/\D/g, "")}` : undefined} color="var(--color-channel-whatsapp)" icon={<WhatsAppIcon className="size-5" />} label="WhatsApp" />
          <Chan href={c.email ? `mailto:${c.email}` : undefined} color="var(--color-channel-email)" icon={<Mail className="size-4" />} label="Email" />
        </div>
        <div className="mt-3 grid grid-cols-5 rounded-full bg-muted p-1" role="tablist">
          {(["projects", "tasks", "profile", "activity", "crm"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("h-9 rounded-full text-[12.5px] sm:text-[13px] font-semibold capitalize transition-all", tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
            >
              {t === "crm" ? "More" : t}
            </button>
          ))}
        </div>
      </header>

      <div key={tab} className="flex-1 overflow-auto animate-fade-in">
        {tab === "projects" && <ClientProjects customerId={c.id} users={users} view="projects" />}
        {tab === "tasks" && <ClientTasks customerId={c.id} users={users} />}
        {tab === "activity" && <ClientProjects customerId={c.id} users={users} view="activity" />}
        {tab === "profile" && (
          <dl className="mx-auto grid max-w-3xl gap-2 p-4 sm:grid-cols-2">
            {[
              ["Client Name", c.name],
              ["Brand / Company", c.company],
              ["Contact Person", c.contact_person],
              ["Phone", c.phone],
              ["WhatsApp", c.whatsapp],
              ["Email", c.email],
              ["Client Since", c.client_since ? new Date(c.client_since + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : null],
              ["Account Manager", manager],
              ["Service", c.service],
              ["Currency", c.currency],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-border bg-card px-3 py-2.5">
                <dt className="text-[12px] font-semibold text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 break-words text-[14.5px] font-bold text-foreground">{v || "—"}</dd>
              </div>
            ))}
            {c.notes && (
              <div className="rounded-md border border-border bg-card px-3 py-2.5 sm:col-span-2">
                <dt className="text-[12px] font-semibold text-muted-foreground">Notes</dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-[14px] text-foreground">{c.notes}</dd>
              </div>
            )}
          </dl>
        )}
        {tab === "crm" &&
          (leadQ.data ? (
            <LeadDetail lead={leadQ.data} users={users} onDeleted={() => navigate({ to: "/app/customers" })} />
          ) : (
            <div className="mx-auto max-w-md p-10 text-center text-[12.5px] text-muted-foreground">
              This client has no linked CRM record.
            </div>
          ))}
      </div>
    </div>
  );
}

function Chan({ href, color, icon, label }: { href?: string; color: string; icon: React.ReactNode; label: string }) {
  if (!href)
    return (
      <span className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-muted/50 text-[13px] font-semibold text-muted-foreground/50">
        {icon}{label}
      </span>
    );
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md text-[13px] font-semibold text-channel-foreground transition hover:brightness-110 active:scale-95"
      style={{ background: color }}
    >
      {icon}{label}
    </a>
  );
}
