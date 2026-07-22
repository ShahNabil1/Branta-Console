import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Check, X, ArrowRight, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAllTransferRequests,
  decideTransferRequests,
} from "@/lib/lead-transfers.functions";
import { getMyPermissions } from "@/lib/permissions.functions";

import { RequireSuperAdmin } from "@/components/branta/require-super-admin";

export const Route = createFileRoute("/_authenticated/app/transfers")({
  component: () => (
    <RequireSuperAdmin>
      <TransfersPage />
    </RequireSuperAdmin>
  ),
  head: () => ({
    meta: [
      { title: "Transfer requests · Branta Tech Console" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function TransfersPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listAllTransferRequests);
  const decideFn = useServerFn(decideTransferRequests);
  const permsFn = useServerFn(getMyPermissions);

  const permsQ = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => permsFn(),
    staleTime: 60_000,
  });
  const [status, setStatus] = useState<
    "pending" | "approved" | "rejected" | "all"
  >("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");

  const q = useQuery({
    queryKey: ["transfers", status],
    queryFn: () => listFn({ data: { status } }),
    staleTime: 5_000,
    enabled: !!permsQ.data?.isSuperAdmin,
  });

  const rows = q.data ?? [];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const decideM = useMutation({
    mutationFn: (decision: "approved" | "rejected") =>
      decideFn({
        data: {
          ids: Array.from(selected),
          decision,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: (_r, decision) => {
      toast.success(
        `${selected.size} request${selected.size > 1 ? "s" : ""} ${decision}`,
      );
      setSelected(new Set());
      setNote("");
      qc.invalidateQueries({ queryKey: ["transfers"] });
      qc.invalidateQueries({ queryKey: ["transfers", "pending-count"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Action failed"),
  });

  const pendingRowsSelectable = useMemo(
    () => rows.filter((r) => r.status === "pending"),
    [rows],
  );
  const canDecide =
    selected.size > 0 &&
    Array.from(selected).every((id) =>
      pendingRowsSelectable.some((r) => r.id === id),
    );

  if (permsQ.isLoading) {
    return (
      <div className="grid h-full place-items-center p-16 text-[12.5px] text-muted-foreground">
        <Loader2 className="mb-2 size-5 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!permsQ.data?.isSuperAdmin) {
    return (
      <div className="mx-auto grid max-w-md gap-3 p-10 text-center">
        <div className="text-[15px] font-semibold text-foreground">
          Not available
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          Only super admins can review lead transfer requests.
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
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">
            Transfer requests
          </h1>
          <p className="text-[12.5px] text-muted-foreground">
            Employees can ask to reassign leads they own. Approve or reject in
            bulk.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Filter
            </div>
            <Select
              value={status}
              onValueChange={(v) =>
                setStatus(v as "pending" | "approved" | "rejected" | "all")
              }
            >
              <SelectTrigger className="h-9 w-40 rounded-sm text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-border bg-card p-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Decision note (optional)"
            className="min-h-[36px] flex-1 rounded-sm text-[12px]"
          />
          <Button
            size="sm"
            disabled={!canDecide || decideM.isPending}
            onClick={() => decideM.mutate("approved")}
            className="h-8 rounded-sm bg-emerald-600 text-[12px] font-medium text-white hover:bg-emerald-700"
          >
            <Check className="mr-1 size-3.5" /> Approve ({selected.size})
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canDecide || decideM.isPending}
            onClick={() => decideM.mutate("rejected")}
            className="h-8 rounded-sm border-red-300 text-[12px] font-medium text-red-600 hover:bg-red-50"
          >
            <X className="mr-1 size-3.5" /> Reject ({selected.size})
          </Button>
        </div>
      )}

      <div className="rounded-sm border border-border bg-card">
        {q.isLoading ? (
          <div className="grid place-items-center p-10 text-[12.5px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Inbox className="size-6 text-muted-foreground" />
            <div className="text-[13px] font-medium">No requests</div>
            <div className="text-[11.5px] text-muted-foreground">
              Nothing to review under this filter.
            </div>
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => {
                      if (v) setSelected(new Set(rows.map((r) => r.id)));
                      else setSelected(new Set());
                    }}
                  />
                </th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Lead</th>
                <th className="px-3 py-2">From → To</th>
                <th className="px-3 py-2">Requester</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Decided</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 align-top">
                    <Checkbox
                      checked={selected.has(r.id)}
                      onCheckedChange={() => toggle(r.id)}
                      disabled={r.status !== "pending"}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {r.lead_slug ? (
                      <Link
                        to="/app/leads/$slug"
                        params={{ slug: r.lead_slug }}
                        className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground hover:bg-muted/70"
                      >
                        {r.lead_slug}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {r.lead_name && (
                      <div className="mt-0.5 max-w-[240px] truncate text-[11.5px] text-muted-foreground">
                        {r.lead_name}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex items-center gap-1.5">
                      <span>{r.from_user_name ?? "—"}</span>
                      <ArrowRight className="size-3 text-muted-foreground" />
                      <span className="font-medium">
                        {r.to_user_name ?? r.to_user_id.slice(0, 8)}
                      </span>
                    </div>
                    {r.note && (
                      <div className="mt-0.5 text-[11px] italic text-muted-foreground">
                        "{r.note}"
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">
                    {r.requester_name ?? r.requester_id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">
                    {r.decided_at ? (
                      <>
                        <div>{new Date(r.decided_at).toLocaleString()}</div>
                        <div className="text-[11px]">
                          by {r.decided_by_name ?? "—"}
                        </div>
                        {r.decision_note && (
                          <div className="mt-0.5 italic">
                            "{r.decision_note}"
                          </div>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: "pending" | "approved" | "rejected" }) {
  const map = {
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-medium capitalize ${map[status]}`}
    >
      {status}
    </span>
  );
}
