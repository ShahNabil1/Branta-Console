// Bridges lead_transfer_requests into the client-side notifications store.
// - Super admins: get a notification on every new pending request.
// - Requesters: get a notification when their request is approved/rejected.
// - Target users (to_user_id): get a notification when a lead is transferred TO them.
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { notifications } from "@/lib/notifications-store";
import { getMyPermissions } from "@/lib/permissions.functions";
import {
  listAllTransferRequests,
  listMyTransferRequests,
  listMyIncomingTransfers,
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
  const listIncoming = useServerFn(listMyIncomingTransfers);

  const isSuper = !!permsQ.data?.isSuperAdmin;
  const uid = permsQ.data?.user_id ?? null;

  // Scope the notifications store per-user so notifications don't leak across
  // accounts on the same browser.
  useEffect(() => {
    notifications.setScope(uid);
  }, [uid]);

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
                    ? `Reassigned to ${r.to_user_name ?? "teammate"}${
                        r.note ? ` · Note: ${r.note}` : ""
                      }`
                    : `Rejected${
                        r.decided_by_name ? ` by ${r.decided_by_name}` : ""
                      }${r.decision_note ? ` · ${r.decision_note}` : ""}`,
                href: r.lead_slug
                  ? `/app/leads/${r.lead_slug}`
                  : "/app/leads",
              });
            });
        }

        // For every user (super admin or not): incoming transfers assigned TO
        // them. Skip self-requested ones — the requester already gets the
        // "Transfer approved" notification above.
        const incoming = await listIncoming();
        if (cancelled) return;
        incoming
          .filter((r) => r.requester_id !== uid)
          .forEach((r) => {
            notifications.push({
              id: `transfer-in:${r.id}`,
              kind: "success",
              title: `Lead assigned to you · ${r.lead_slug ?? "Lead"}`,
              description: `${
                r.requester_name ?? r.from_user_name ?? "A teammate"
              } transferred ${r.lead_slug ?? "a lead"}${
                r.lead_name ? ` (${r.lead_name})` : ""
              } to you${r.note ? ` · Note: ${r.note}` : ""}`,
              href: r.lead_slug
                ? `/app/leads/${r.lead_slug}`
                : "/app/leads",
            });
          });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [permsQ.data, isSuper, uid, listAll, listMine, listIncoming]);

  // Realtime — super admins listen for INSERT (new pending requests);
  // requesters listen for UPDATE on their own rows;
  // target users listen for UPDATE where they are the to_user_id.
  useEffect(() => {
    if (!permsQ.data || !uid) return;
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
                ? `Your transfer request was approved${
                    row.note ? ` · Note: ${row.note}` : ""
                  }`
                : `Your transfer request was rejected${
                    row.decision_note ? ` · ${row.decision_note}` : ""
                  }`,
            href: "/app/transfers",
          });
        },
      );
    }

    // Target-user listener — fires for everyone (including super admins) when
    // a lead is transferred TO them.
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "lead_transfer_requests",
        filter: `to_user_id=eq.${uid}`,
      },
      (payload) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = payload.new as any;
        if (row.status !== "approved") return;
        if (row.requester_id === uid) return; // self-request, already notified
        notifications.push({
          id: `transfer-in:${row.id}`,
          kind: "success",
          title: `Lead assigned to you`,
          description: `A teammate transferred a lead to you${
            row.note ? ` · Note: ${row.note}` : ""
          }`,
          href: "/app/leads",
        });
      },
    );

    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [permsQ.data, isSuper, uid]);

  return null;
}
