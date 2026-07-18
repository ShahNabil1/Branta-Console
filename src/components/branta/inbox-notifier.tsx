// Realtime toast + notification when a new inbound message lands in the inbox,
// especially when it links to a lead the current user handles.
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { notifications } from "@/lib/notifications-store";

interface InboxRealtimeRow {
  gmail_message_id: string;
  gmail_thread_id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  lead_id: string | null;
  handled_by: string | null;
}

export function InboxNotifier() {
  const navigate = useNavigate();
  const currentUserId = useRef<string | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) currentUserId.current = data.user?.id ?? null;
    });

    const ch = supabase
      .channel("inbox-notifier")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inbox_messages" },
        (msg) => {
          const row = msg.new as InboxRealtimeRow;
          if (!row?.gmail_message_id || seen.current.has(row.gmail_message_id))
            return;
          seen.current.add(row.gmail_message_id);
          const mine =
            currentUserId.current &&
            row.handled_by === currentUserId.current;
          const title = row.lead_id
            ? `Lead replied: ${row.from_name || row.from_email}`
            : `New inbox mail from ${row.from_name || row.from_email}`;
          const description = row.subject ?? undefined;
          notifications.push({
            id: `inbox:${row.gmail_message_id}`,
            kind: "info",
            title,
            description,
            href: "/app/inbox",
          });
          (mine ? toast.warning : toast.info)(title, {
            description,
            action: {
              label: "Open inbox",
              onClick: () => navigate({ to: "/app/inbox" }),
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
