import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DRAFT_LEAD_NAME,
  deleteLead,
  listAssignableUsers,
  listDraftLeads,
} from "@/lib/leads.functions";
import { getMyPermissions } from "@/lib/permissions.functions";

export const Route = createFileRoute("/_authenticated/app/leads/drafts")({
  component: DraftsPage,
  head: () => ({
    meta: [
      { title: "Lead drafts · Branta Tech Console" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function DraftsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();

  const permsFn = useServerFn(getMyPermissions);
  const listFn = useServerFn(listDraftLeads);
  const usersFn = useServerFn(listAssignableUsers);
  const delFn = useServerFn(deleteLead);

  const permsQ = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => permsFn(),
    staleTime: 60_000,
  });
  const canManage = !!permsQ.data?.lead_manage;
  const isSuperAdmin = !!permsQ.data?.isSuperAdmin;

  const [ownerFilter, setOwnerFilter] = useState<string>("all");

  const usersQ = useQuery({
    queryKey: ["leads", "assignable-users"],
    queryFn: () => usersFn(),
    enabled: isSuperAdmin,
    staleTime: 60_000,
  });

  const draftsQ = useQuery({
    queryKey: ["leads", "drafts", isSuperAdmin ? ownerFilter : "me"],
    queryFn: () =>
      listFn({
        data: isSuperAdmin
          ? { ownerFilter: ownerFilter as "all" | "me" | string }
          : {},
      }),
    enabled: permsQ.isSuccess,
  });

  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Draft deleted · slug released");
      qc.invalidateQueries({ queryKey: ["leads", "drafts"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const rows = useMemo(() => draftsQ.data ?? [], [draftsQ.data]);

  if (permsQ.isSuccess && !canManage) {
    return (
      <div className="mx-auto grid max-w-md gap-3 p-10 text-center">
        <div className="text-[15px] font-semibold">Forbidden</div>
        <p className="text-[12.5px] text-muted-foreground">
          You do not have permission to manage leads.
        </p>
        <Link to="/app/leads" className="mx-auto text-[12.5px] underline">
          Back to leads
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 rounded-sm px-2 text-[12.5px]"
          >
            <Link to="/app/leads">
              <ChevronLeft className="mr-1 size-3.5" />
              Leads
            </Link>
          </Button>
          <h1 className="text-[15px] font-semibold text-foreground">
            Lead drafts
          </h1>
          <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
            {rows.length}
          </span>
        </div>
        {isSuperAdmin && (
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-muted-foreground">
              Employee
            </span>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="h-8 w-[220px] rounded-sm text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                <SelectItem value="me">Just me</SelectItem>
                {(usersQ.data ?? []).map((u) => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {u.full_name ?? u.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {draftsQ.isLoading ? (
        <div className="grid place-items-center py-16 text-[12.5px] text-muted-foreground">
          <Loader2 className="mb-2 size-5 animate-spin" />
          Loading drafts…
        </div>
      ) : rows.length === 0 ? (
        <div className="grid place-items-center rounded-md border border-dashed border-border py-16 text-center">
          <div className="text-[13px] font-medium">No drafts</div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Start typing in a new lead and it will autosave here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <table className="w-full text-[12.5px]">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Slug</th>
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                <th className="px-3 py-2 text-left font-semibold">Email</th>
                <th className="px-3 py-2 text-left font-semibold">Company</th>
                {isSuperAdmin && (
                  <th className="px-3 py-2 text-left font-semibold">
                    Created by
                  </th>
                )}
                <th className="px-3 py-2 text-left font-semibold">Updated</th>
                <th className="px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const displayName =
                  r.name && r.name !== DRAFT_LEAD_NAME ? r.name : "—";
                return (
                  <tr
                    key={r.id}
                    className="border-t border-border hover:bg-muted/30"
                  >
                    <td className="px-3 py-2 font-mono text-[11.5px]">
                      <Link
                        to="/app/leads/$slug"
                        params={{ slug: r.slug }}
                        className="text-primary hover:underline"
                      >
                        {r.slug}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() =>
                          navigate({
                            to: "/app/leads/$slug",
                            params: { slug: r.slug },
                          })
                        }
                      >
                        {displayName}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.email ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.company ?? "—"}
                    </td>
                    {isSuperAdmin && (
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.owner_name ?? "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(r.updated_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-sm px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={delM.isPending}
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Delete draft ${r.slug}?`,
                            description:
                              "The slug will be released and can be reused by the next new lead. This cannot be undone.",
                            confirmText: "Delete draft",
                            destructive: true,
                          });
                          if (ok) delM.mutate(r.id);
                        }}
                      >
                        <Trash2 className="mr-1 size-3.5" />
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
