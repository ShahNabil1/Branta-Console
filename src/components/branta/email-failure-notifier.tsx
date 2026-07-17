// Realtime toast for outbound email failures.
// Mounted once in AppShell so any signed-in employee sees their own failures.
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

interface LeadEmailPayload {
  id: string;
  lead_id: string;
  status: string;
  sent_by: string | null;
  subject: string | null;
  to_emails: string[] | null;
  error_message: string | null;
}

export function EmailFailureNotifier() {
  const navigate = useNavigate();
  const currentUserId = useRef<string | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) currentUserId.current = data.user?.id ?? null;
    });

    const ch = supabase
      .channel("email-failure-notifier")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lead_emails", filter: "status=eq.failed" },
        (msg) => {
          const row = msg.new as LeadEmailPayload;
          if (!row?.id || seen.current.has(row.id)) return;
          seen.current.add(row.id);
          if (currentUserId.current && row.sent_by !== currentUserId.current) return;
          const to = row.to_emails?.[0] ?? "recipient";
          toast.error(`Email to ${to} failed`, {
            description: row.error_message ?? row.subject ?? undefined,
            action: {
              label: "Mail queue",
              onClick: () => navigate({ to: "/app/mail-queue" }),
            },
            duration: 8000,
          });
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [navigate]);

  return null;
}
