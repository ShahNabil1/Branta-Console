import { createFileRoute } from "@tanstack/react-router";
import { oauthPopupResponse } from "@/lib/google-popup-protocol";

// Resend OAuth return for a company's Resend account.
// Trust comes only from the HMAC-signed state minted by startResendConnect (carries the sealed PKCE verifier).
export const Route = createFileRoute("/api/public/resend/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const rs = await import("@/lib/company-resend.server");
        const st = await rs.verifyState(url.searchParams.get("state") ?? "");
        const back = (slug: string | null, status: string, msg?: string) => {
          if (st?.p && st.o === origin) {
            return oauthPopupResponse({ type: "company-resend-connected", popupId: st.p, slug: st.s, status: status === "ok" ? "ok" : "error", message: msg?.slice(0, 240) }, origin, "Resend", "branta-resend-");
          }
          const to = new URL(slug ? `/app/companies/${slug}` : "/app/companies", origin);
          to.searchParams.set("tab", "integrations");
          return Response.redirect(to.toString(), 302);
        };
        if (!st || st.o !== origin) return back(null, "error", "This connect link expired. Try again.");
        const err = url.searchParams.get("error");
        if (err) return back(st.s, "error", err === "access_denied" ? "Permission was not granted." : `Resend returned: ${err}`);
        const code = url.searchParams.get("code");
        if (!code) return back(st.s, "error", "Resend didn't return an authorization code.");
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: ok } = await (supabaseAdmin as any).rpc("can_manage_company", { _company: st.c, _user: st.u });
          if (!ok) return back(st.s, "error", "You can no longer manage this company.");
          const tok = await rs.exchangeCode(code, st.verifier, origin);
          if (!tok.refresh_token) return back(st.s, "error", "Resend didn't return long-term access. Connect again.");
          await rs.saveAccount({ companyId: st.c, refresh: tok.refresh_token, scopes: (tok.scope ?? "").split(" ").filter(Boolean), userId: st.u });
          return back(st.s, "ok");
        } catch (e) {
          console.error("[resend-oauth] callback failed", e);
          return back(st.s, "error", e instanceof Error ? e.message : "Connection failed.");
        }
      },
    },
  },
});
