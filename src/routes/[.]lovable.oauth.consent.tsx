import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { oauthReturnPath } from "@/lib/oauth-return-path";
import brandLogo from "@/assets/brand-logo.png.asset.json";

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({ authorization_id: typeof search.authorization_id === "string" ? search.authorization_id : "" }),
  head: () => ({ meta: [
    { title: "Authorize agent access · Branta Hub" },
    { name: "description", content: "Approve or deny secure agent access to your Branta Hub employee workspace." },
    { property: "og:title", content: "Authorize agent access · Branta Hub" },
    { property: "og:description", content: "Secure, permission-aware agent connections for Branta Hub." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("This authorization link is missing its request ID. Start a new connection.");
    const next = oauthReturnPath(location.pathname + location.searchStr + location.hash);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login", search: { next } });
    const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance?.currentLevel !== "aal2") throw redirect({ to: "/login", search: { next } });
    const [{ data: active, error: activeError }, { data: profile, error: profileError }] = await Promise.all([
      supabase.rpc("is_active_employee", { _user: data.user.id }),
      supabase.from("profiles").select("must_change_password").eq("user_id", data.user.id).maybeSingle(),
    ]);
    if (activeError || profileError || !active || !profile) throw new Error("An active Branta employee account is required.");
    if (profile.must_change_password || data.user.app_metadata?.password_reset_pending === true) throw new Error("Complete your required password change in Branta Hub, then start a new connection.");
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.searchStr).get("authorization_id");
    if (!id) throw new Error("Missing authorization request.");
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
    if (error || !data) throw new Error("This authorization request is unavailable or expired. Start a new connection.");
    if ("redirect_url" in data) throw redirect({ href: data.redirect_url });
    return data;
  },
  pendingComponent: () => <main className="grid min-h-screen place-items-center bg-background"><Loader2 className="size-6 animate-spin text-primary" aria-label="Loading authorization" /></main>,
  errorComponent: ({ error }) => <ConsentFrame><h1 className="text-xl font-semibold">Connection unavailable</h1><p role="alert" className="mt-3 text-sm text-muted-foreground">{error.message}</p><Button asChild variant="outline" className="mt-6"><Link to="/login">Return to sign in</Link></Button></ConsentFrame>,
  component: Consent,
});

function ConsentFrame({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><section className="w-full max-w-lg rounded border border-border bg-card p-6 shadow-sm"><img src={brandLogo.url} alt="Branta Hub" className="mb-8 h-9 w-auto" />{children}</section></main>;
}

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decide(approve: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const options = { skipBrowserRedirect: true };
      const result = approve
        ? await supabase.auth.oauth.approveAuthorization(authorization_id, options)
        : await supabase.auth.oauth.denyAuthorization(authorization_id, options);
      if (result.error || !result.data?.redirect_url) throw new Error(approve ? "Approval failed. Try again." : "Declining failed. Try again.");
      window.location.assign(result.data.redirect_url);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not complete your decision.");
      setBusy(false);
    }
  }
  return <ConsentFrame>
    <ShieldCheck className="mb-3 size-8 text-primary" />
    <h1 className="text-xl font-semibold">Connect {details.client.name || "an agent"}</h1>
    <p className="mt-3 text-sm text-muted-foreground">This client can read company lead and customer directories as your Branta Hub account, within your existing permissions. Contact details and financial values are not included. It cannot send mail, delete records, or make payments.</p>
    <dl className="mt-5 space-y-2 border-y border-border py-4 text-sm"><div><dt className="text-muted-foreground">Account</dt><dd>{details.user.email}</dd></div><div><dt className="text-muted-foreground">Requested account access</dt><dd className="break-words font-mono text-xs">{details.scope || "Authenticated access"}</dd></div></dl>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    <div className="mt-6 flex gap-3"><Button disabled={busy} onClick={() => void decide(true)}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Approve</Button><Button variant="outline" disabled={busy} onClick={() => void decide(false)}>Deny</Button></div>
  </ConsentFrame>;
}