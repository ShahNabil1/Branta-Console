import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { issueTrackerSession, TRACKER_REDIRECT_RE } from "@/lib/tracker-sso.functions";
import { SsoHandoff, type HandoffStage } from "@/components/sso/sso-handoff";
import { APPS_TRACKER as trackerLogoAsset } from "@/lib/brand-assets";
const trackerLogo = trackerLogoAsset.url;

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
  const issue = useServerFn(issueTrackerSession);
  const [stage, setStage] = useState<HandoffStage>("verify");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!redirect_uri || !TRACKER_REDIRECT_RE.test(redirect_uri)) {
      setError("This sign-in link is not from the Branta Tracker extension.");
      setStage("error");
      return;
    }
    let cancelled = false;
    setStage("issue");
    issue({ data: { redirect_uri } })
      .then(({ access_token, refresh_token, expires_in }) => {
        if (cancelled) return;
        const frag = new URLSearchParams({ access_token, refresh_token, expires_in: String(expires_in) });
        if (state) frag.set("state", state);
        setStage("done");
        setTimeout(() => window.location.replace(`${redirect_uri}#${frag.toString()}`), 450);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message || "Sign-in failed.");
        setStage("error");
      });
    return () => {
      cancelled = true;
    };
  }, [redirect_uri, state, issue]);

  return <SsoHandoff appName="Branta Tracker" appLogo={trackerLogo} stage={stage} error={error} />;
}
