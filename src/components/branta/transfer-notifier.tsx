// Bridges lead_transfer_requests into the client-side notifications store.
// - Super admins: get a notification on every new pending request.
// - Requesters: get a notification when their request is approved/rejected.
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { notifications } from "@/lib/notifications-store";
import { getMyPermissions } from "@/lib/permissions.functions";
import {
  listAllTransferRequests,
  listMyTransferRequests,
} from "@/lib/lead-transfers.functions";
import { useQuery } from "@tanstack/react-query";

export function TransferNotifier() {
  const permsFn = useServerFn(getMyPermissions);
  const permsQ = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => permsFn(),
    staleTime: 60_000,
  });

  const listAll = useServerFn(listAllTransferRequests);
  const listMine = useServerFn(listMyTransferRequests);

  const isSuper = !!permsQ.data?.isSuperAdmin;

  // Seed on mount so nothing is missed across sessions.
  useEffect(() => {
    if (!permsQ.data) return;
    let cancelled = false;
    (async () => {
      try {
        if (isSuper) {
          const pending = await listAll({ data: { status: "pending" } });
          if (cancelled) return;
          pending.forEach((r) => {
            notifications.push({
              id: `transfer-req:${r.id}`,
              kind: "info",
              title: `Transfer request · ${r.lead_slug ?? "Lead"}`,
              description: `${r.requester_name ?? "Employee"} → ${
                r.to_user_name ?? "teammate"
              }`,
              href: "/app/transfers",
            });
          });
        } else {
          const mine = await listMine();
          if (cancelled) return;
          mine
            .filter((r) => r.status !== "pending")
            .forEach((r) => {
              notifications.push({
                id: `transfer-dec:${r.id}`,
                kind: r.status === "approved" ? "success" : "info",
                title: `Transfer ${r.status} · ${r.lead_slug ?? "Lead"}`,
                description:
                  r.status === "approved"
                    ? `Reassigned to ${r.to_user_name ?? "teammate"}`
                    : `Rejected${r.decided_by_name ? ` by ${r.decided_by_name}` : ""}`,
                href: r.lead_slug
                  ? `/app/leads/${r.lead_slug}`
                  : "/app/leads",
              });
            });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [permsQ.data, isSuper, listAll, listMine]);

  // Realtime — super admins listen for INSERT, requesters for UPDATE on their own rows.
  useEffect(() => {
    if (!permsQ.data) return;
    const uid = permsQ.data.user_id;
    const channel = supabase.channel(`transfers-${uid}`);

    if (isSuper) {
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lead_transfer_requests" },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = payload.new as any;
          notifications.push({
            id: `transfer-req:${row.id}`,
            kind: "info",
            title: `Transfer request · Lead`,
            description: `New pending transfer awaiting review`,
            href: "/app/transfers",
          });
        },
      );
    } else {
      channel.on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "lead_transfer_requests",
          filter: `requester_id=eq.${uid}`,
        },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = payload.new as any;
          if (row.status === "pending") return;
          notifications.push({
            id: `transfer-dec:${row.id}`,
            kind: row.status === "approved" ? "success" : "info",
            title: `Transfer ${row.status}`,
            description:
              row.status === "approved"
                ? "Your transfer request was approved"
                : "Your transfer request was rejected",
            href: "/app/transfers",
          });
        },
      );
    }

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [permsQ.data, isSuper]);

  return null;
}
