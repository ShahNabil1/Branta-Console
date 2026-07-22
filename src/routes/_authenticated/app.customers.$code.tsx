import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft, Building2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCustomerByCode } from "@/lib/customers.functions";
import { getLeadBySlug, listAssignableUsers, logLeadView } from "@/lib/leads.functions";
import { LeadDetail } from "@/components/leads/lead-detail";

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

  return (
    <div className="flex h-full flex-col">
      <header className="hairline-b flex items-center gap-3 bg-card px-4 py-2">
        <button
          onClick={() => navigate({ to: "/app/customers" })}
          className="grid size-7 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Back to customers"
        >
          <ArrowLeft className="size-4" />
        </button>
        <Building2 className="size-4 text-brand" />
        <span className="font-mono text-[12px] font-semibold text-foreground">
          {customer.customer_code}
        </span>
        <span className="text-[13px] font-medium text-foreground">{customer.name}</span>
        {customer.company && (
          <span className="text-[12px] text-muted-foreground">· {customer.company}</span>
        )}
        <span className="ml-2 rounded-sm bg-brand/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
          Customer
        </span>
        {leadSlug && (
          <Link
            to="/app/leads/$slug"
            params={{ slug: leadSlug }}
            className="ml-auto font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            source: {leadSlug}
          </Link>
        )}
      </header>

      <div className="flex-1 overflow-auto">
        {leadQ.data ? (
          <LeadDetail
            lead={leadQ.data}
            users={usersQ.data ?? []}
            onDeleted={() => navigate({ to: "/app/customers" })}
          />
        ) : (
          <div className="mx-auto max-w-md p-10 text-center text-[12.5px] text-muted-foreground">
            This customer has no linked CRM record. Detail features are
            unavailable.
          </div>
        )}
      </div>
    </div>
  );
}
