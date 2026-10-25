import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { issueTrackerToken, TRACKER_REDIRECT_RE } from "@/lib/tracker-sso.functions";

export const Route = createFileRoute("/_authenticated/sso/tracker")({
  validateSearch: z.object({
    redirect_uri: z.string().optional(),
    state: z.string().max(200).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Connect Tracker Extension · Branta Console" },
      { name: "description", content: "Sign in to the Branta Tracker extension with your Branta Console account." },
      { property: "og:title", content: "Connect Tracker Extension · Branta Console" },
      { property: "og:description", content: "Single sign-on for the Branta Tracker extension." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrackerSso,
});

function TrackerSso() {
  const { redirect_uri, state } = Route.useSearch();
  const issue = useServerFn(issueTrackerToken);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!redirect_uri || !TRACKER_REDIRECT_RE.test(redirect_uri)) {
      setError("This sign-in link is not from the Branta Tracker extension.");
      return;
    }
    let cancelled = false;
    issue({ data: { redirect_uri } })
      .then(({ token, expires_in }) => {
        if (cancelled) return;
        const frag = new URLSearchParams({ token, expires_in: String(expires_in) });
        if (state) frag.set("state", state);
        setDone(true);
        window.location.replace(`${redirect_uri}#${frag.toString()}`);
      })
      .catch((e: Error) => !cancelled && setError(e.message || "Sign-in failed."));
    return () => {
      cancelled = true;
    };
  }, [redirect_uri, state, issue]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded border border-border bg-card p-6 text-center">
        {error ? (
          <>
            <ShieldAlert className="mx-auto h-8 w-8 text-destructive" />
            <h1 className="mt-3 text-[15px] font-semibold text-foreground">Couldn't connect</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{error}</p>
          </>
        ) : done ? (
          <>
            <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
            <h1 className="mt-3 text-[15px] font-semibold text-foreground">Connected</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">Returning to the Tracker extension…</p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <h1 className="mt-3 text-[15px] font-semibold text-foreground">Connecting Tracker Extension</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">Verifying your Branta account…</p>
          </>
        )}
      </div>
    </div>
  );
}
