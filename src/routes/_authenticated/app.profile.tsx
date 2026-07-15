import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/profile")({
  head: () => ({ meta: [{ title: "Profile · Branta Tech" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <header className="mb-8">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Account
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Profile
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Profile details will be added here shortly.
        </p>
      </header>
      <div className="rounded-md border border-border bg-card p-6 text-[13px] text-muted-foreground">
        Coming soon.
      </div>
    </div>
  );
}
