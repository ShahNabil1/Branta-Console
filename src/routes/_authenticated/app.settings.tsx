import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { RequireSuperAdmin } from "@/components/branta/require-super-admin";

export const Route = createFileRoute("/_authenticated/app/settings")({
  component: () => (
    <RequireSuperAdmin>
      <SettingsStub />
    </RequireSuperAdmin>
  ),
});

function SettingsStub() {
  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="mb-6">
        <h1 className="text-[20px] font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Profile, security, and device sessions.
        </p>
      </div>
      <div className="grid place-items-center rounded-md border border-dashed border-border bg-card p-16 text-center">
        <div className="grid size-10 place-items-center rounded-full bg-muted">
          <Settings className="size-5 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <div className="mt-3 text-[14px] font-semibold text-foreground">
          Settings module — Phase 2
        </div>
        <p className="mt-1 max-w-md text-[12px] text-muted-foreground">
          Profile fields, uploads, and device / session revoke controls land in
          the next build phase.
        </p>
      </div>
    </div>
  );
}
