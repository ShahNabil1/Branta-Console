import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disconnectMyApp, listMyConnectedApps } from "@/lib/tracker-sso.functions";

const LABELS: Record<string, string> = { tracker_extension: "Branta Tracker Extension" };

export function ConnectedAppsCard() {
  const list = useServerFn(listMyConnectedApps);
  const disconnect = useServerFn(disconnectMyApp);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["connected-apps"], queryFn: () => list() });
  const m = useMutation({
    mutationFn: (app: "tracker_extension") => disconnect({ data: { app } }),
    onSuccess: () => {
      toast.success("Disconnected");
      qc.invalidateQueries({ queryKey: ["connected-apps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = q.data ?? [];
  if (!rows.length) return null;

  return (
    <div className="space-y-2">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Connected apps</div>
      {rows.map((r) => (
        <div key={r.app} className="flex flex-wrap items-center gap-3 rounded border border-border bg-card p-3">
          <MonitorSmartphone className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-foreground">{LABELS[r.app] ?? r.app}</div>
            <div className="text-[12px] text-muted-foreground">
              Connected {new Date(r.connected_at).toLocaleDateString()} · last sign-in{" "}
              {new Date(r.last_authorized_at).toLocaleString()}
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate("tracker_extension")}>
            Disconnect
          </Button>
        </div>
      ))}
    </div>
  );
}
