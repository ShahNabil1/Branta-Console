import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Branta Console · Employee Workspace" },
    { name: "description", content: "Branta Tech employee workspace and secure connected-app access." },
    { property: "og:title", content: "Branta Console · Employee Workspace" },
    { property: "og:description", content: "Secure employee workspace for Branta Tech." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/app" });
    throw redirect({ to: "/login" });
  },
  component: () => null,
});
