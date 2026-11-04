import { createFileRoute } from "@tanstack/react-router";
import { googlePopupResponse } from "@/lib/google-popup-protocol";

// Google OAuth return for a company's dedicated Gmail + Calendar account.
// Trust comes only from the HMAC-signed state minted by startGoogleConnect.
export const Route = createFileRoute("/api/public/google-oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const g = await import("@/lib/company-google.server");
        const st = await g.verifyState(url.searchParams.get("state") ?? "");
        const back = (slug: string | null, status: string, msg?: string) => {
          if (st?.p && st.o === origin) {
            return googlePopupResponse({ type: "company-google-connected", popupId: st.p, slug: st.s, status: status === "ok" ? "ok" : "error", message: msg?.slice(0, 240) }, origin);
          }
          const to = new URL(slug ? `/app/companies/${slug}` : "/app/companies", origin);
          to.searchParams.set("tab", "integrations");
          to.searchParams.set("google", status);
          if (msg) to.searchParams.set("google_msg", msg.slice(0, 240));
          return Response.redirect(to.toString(), 302);
        };
        if (!st || st.o !== origin) return back(null, "error", "This connect link expired. Try again.");
        const gErr = url.searchParams.get("error");
        if (gErr) return back(st.s, "error", gErr === "access_denied" ? "Permission was not granted." : `Google returned: ${gErr}`);
        const code = url.searchParams.get("code");
        if (!code) return back(st.s, "error", "Google didn't return an authorization code.");
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: ok } = await (supabaseAdmin as any).rpc("can_manage_company", { _company: st.c, _user: st.u });
          if (!ok) return back(st.s, "error", "You can no longer manage this company.");
          const tok = await g.exchangeCode(code, origin);
          const granted = tok.scope.split(" ");
          const missing = g.REQUIRED_SCOPES.filter((s) => !granted.includes(s));
          if (missing.length) {
            const names = missing.map((s) => (s.includes("gmail") ? "Gmail read" : "Calendar events")).join(" and ");
            return back(st.s, "error", `${names} permission was unticked. Connect again and allow every box.`);
          }
          const who = await g.userInfo(tok.access_token);
          await g.saveAccount({ companyId: st.c, email: who.email, name: who.name, refresh: tok.refresh_token ?? null, scopes: granted, userId: st.u });
          return back(st.s, "ok");
        } catch (e) {
          console.error("[google-oauth] callback failed", e);
          return back(st.s, "error", e instanceof Error ? e.message : "Connection failed.");
        }
      },
    },
  },
});
