import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  getLeadBySlug,
  listAssignableUsers,
  logLeadView,
  DRAFT_LEAD_NAME,
} from "@/lib/leads.functions";
import { LeadDetail } from "@/components/leads/lead-detail";

const searchSchema = z.object({
  new: fallback(z.number().int(), 0).default(0),
});

export const Route = createFileRoute("/_authenticated/app/leads/$slug")({
  component: LeadDetailPage,
  validateSearch: zodValidator(searchSchema),
  head: ({ params }) => ({
    meta: [
      { title: `Lead ${params.slug} · Branta Tech Console` },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function LeadDetailPage() {
  const { slug } = Route.useParams();
  const { new: isNewFlag } = Route.useSearch();
  const isNew = isNewFlag === 1;
  const navigate = useNavigate();
  const getFn = useServerFn(getLeadBySlug);
  const listUsers = useServerFn(listAssignableUsers);
  const logView = useServerFn(logLeadView);
  const qc = useQueryClient();

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

  // Log a "viewed" activity when opening the lead (skipped for freshly
  // created draft leads to avoid double-logging alongside "created").
  useEffect(() => {
    const leadId = leadQ.data?.id;
    if (!leadId || isNew) return;
    logView({ data: { leadId } })
      .then((res) => {
        if (res?.logged) {
          qc.invalidateQueries({ queryKey: ["leads", "activities", leadId] });
        }
      })
      .catch(() => {});
  }, [leadQ.data?.id, isNew, logView, qc]);

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

  // For a freshly created draft lead, render name field as empty placeholder
  // by masking the sentinel "Untitled lead" name to "". Drafts always open
  // in edit mode with autosave.
  const isDraftLead = !!leadQ.data.is_draft;
  const effectiveLead =
    (isNew || isDraftLead) && leadQ.data.name === DRAFT_LEAD_NAME
      ? { ...leadQ.data, name: "" }
      : leadQ.data;

  return (
    <LeadDetail
      lead={effectiveLead}
      users={usersQ.data ?? []}
      initialEdit={isNew || isDraftLead}
      onDeleted={() => navigate({ to: "/app/leads" })}
    />
  );
}

