import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { issueAdmakaiSession } from "@/lib/admakai-sso.functions";
import { isAdmakaiCallback } from "@/lib/admakai-policy";
import { SsoHandoff, type HandoffStage } from "@/components/sso/sso-handoff";
import { APPS_ADMAKAI_WORDMARK as admakaiLogo } from "@/lib/brand-assets";

export const Route = createFileRoute("/_authenticated/sso/admakai")({
  validateSearch: z.object({ redirect_uri: z.string().optional(), state: z.string().max(200).optional() }),
  head: () => ({ meta: [
    { title: "Connect Admakai · Branta Console" }, { name: "description", content: "Secure Admakai sign-in with your Branta account." },
    { property: "og:title", content: "Connect Admakai · Branta Console" }, { property: "og:description", content: "Authorized employee access to Admakai." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: AdmakaiSso,
});
function AdmakaiSso() {
  const { redirect_uri, state } = Route.useSearch();
  const issue = useServerFn(issueAdmakaiSession);
  const started = useRef(false);
  const [stage, setStage] = useState<HandoffStage>("verify");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!redirect_uri || !isAdmakaiCallback(redirect_uri)) { setError("This Admakai sign-in address is not approved."); setStage("error"); return; }
    const deny = (description: string) => {
      const fragment = new URLSearchParams({ error: "denied", error_description: description });
      if (state) fragment.set("state", state);
      window.location.replace(`${redirect_uri}#${fragment}`);
    };
    if (!state) { deny("Missing sign-in state. Please start again from Admakai."); return; }
    setStage("issue");
    issue({ data: { redirect_uri, state } }).then((session) => {
      setStage("done");
      const fragment = new URLSearchParams({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: String(session.expires_in), state: session.state });
      setTimeout(() => window.location.replace(`${redirect_uri}#${fragment}`), 450);
    }).catch(() => deny("Admakai sign-in was denied. Verify your employee access and try again."));
  }, [redirect_uri, state, issue]);
  return <SsoHandoff appName="Admakai" appLogo={admakaiLogo.url} wideLogo stage={stage} error={error} />;
}
