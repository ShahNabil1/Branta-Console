import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/profile/activity")({
  head: () => ({ meta: [{ title: "My Activity · Profile" }] }),
  component: ActivityTab,
});

function ActivityTab() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="grid place-items-center rounded-md border border-dashed border-border bg-card p-16 text-center">
        <div className="grid size-10 place-items-center rounded-full bg-muted">
          <Activity className="size-5 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <div className="mt-3 text-[14px] font-semibold text-foreground">
          Activity timeline — coming next
        </div>
        <p className="mt-1 max-w-md text-[12px] text-muted-foreground">
          Every action you take across the console — logins, edits,
          conversions, uploads — will appear here in a real-time feed.
        </p>
      </div>
    </div>
  );
}
