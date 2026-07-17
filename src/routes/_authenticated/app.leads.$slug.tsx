import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getLeadBySlug, listAssignableUsers } from "@/lib/leads.functions";
import { LeadDetail } from "@/components/leads/lead-detail";

export const Route = createFileRoute("/_authenticated/app/leads/$slug")({
  component: LeadDetailPage,
  head: ({ params }) => ({
    meta: [
      { title: `Lead ${params.slug} · Branta Tech Console` },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function LeadDetailPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const getFn = useServerFn(getLeadBySlug);
  const listUsers = useServerFn(listAssignableUsers);

  const leadQ = useQuery({
    queryKey: ["leads", "by-slug", slug],
    queryFn: () => getFn({ data: { slug } }),
    staleTime: 10_000,
  });
  const usersQ = useQuery({
    queryKey: ["leads", "assignable-users"],
    queryFn: () => listUsers(),
    staleTime: 60_000,
  });

  // Realtime refresh when this lead's row or activities/contacts change.
  useEffect(() => {
    const leadId = leadQ.data?.id;
    if (!leadId) return;
    const ch = supabase
      .channel(`lead-${leadId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `id=eq.${leadId}` },
        () => leadQ.refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_contacts", filter: `lead_id=eq.${leadId}` },
        () => leadQ.refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [leadQ]);

  if (leadQ.isLoading) {
    return (
      <div className="grid h-full place-items-center p-16 text-[12.5px] text-muted-foreground">
        <Loader2 className="mb-2 size-5 animate-spin" />
        Loading lead…
      </div>
    );
  }

  if (leadQ.isError || !leadQ.data) {
    return (
      <div className="mx-auto grid max-w-md gap-3 p-10 text-center">
        <div className="text-[15px] font-semibold text-foreground">
          Lead not found
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          No lead matches <span className="font-mono">{slug}</span>. It may have
          been deleted.
        </p>
        <Link
          to="/app/leads"
          className="mx-auto rounded-sm border border-border px-3 py-1.5 text-[12.5px] hover:bg-muted"
        >
          Back to leads
        </Link>
      </div>
    );
  }

  return (
    <LeadDetail
      lead={leadQ.data}
      users={usersQ.data ?? []}
      onDeleted={() => navigate({ to: "/app/leads" })}
    />
  );
}
