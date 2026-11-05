import { createFileRoute } from "@tanstack/react-router";
import { oauthPopupResponse } from "@/lib/google-popup-protocol";

// Cloudflare OAuth return for a company's Cloudflare account.
// Trust comes only from the HMAC-signed state minted by startCloudflareConnect.
export const Route = createFileRoute("/api/public/cloudflare/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const cf = await import("@/lib/company-cloudflare.server");
        const st = await cf.verifyState(url.searchParams.get("state") ?? "");
        const back = (slug: string | null, status: string, msg?: string) => {
          if (st?.p && st.o === origin) {
            return oauthPopupResponse({ type: "company-cloudflare-connected", popupId: st.p, slug: st.s, status: status === "ok" ? "ok" : "error", message: msg?.slice(0, 240) }, origin, "Cloudflare", "branta-cloudflare-");
          }
          const to = new URL(slug ? `/app/companies/${slug}` : "/app/companies", origin);
          to.searchParams.set("tab", "integrations");
          return Response.redirect(to.toString(), 302);
        };
        if (!st || st.o !== origin) return back(null, "error", "This connect link expired. Try again.");
        const err = url.searchParams.get("error");
        if (err) return back(st.s, "error", err === "access_denied" ? "Permission was not granted." : `Cloudflare returned: ${err}`);
        const code = url.searchParams.get("code");
        if (!code) return back(st.s, "error", "Cloudflare didn't return an authorization code.");
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: ok } = await (supabaseAdmin as any).rpc("can_manage_company", { _company: st.c, _user: st.u });
          if (!ok) return back(st.s, "error", "You can no longer manage this company.");
          const tok = await cf.exchangeCode(code, origin);
          if (!tok.refresh_token) return back(st.s, "error", "Cloudflare didn't return offline access. Connect again.");
          const who = await cf.identity(tok.access_token);
          await cf.saveAccount({ companyId: st.c, refresh: tok.refresh_token, scopes: (tok.scope ?? "").split(" ").filter(Boolean), userId: st.u, email: who.email, cfUserId: who.userId, accounts: who.accounts });
          return back(st.s, "ok");
        } catch (e) {
          console.error("[cloudflare-oauth] callback failed", e);
          return back(st.s, "error", e instanceof Error ? e.message : "Connection failed.");
        }
      },
    },
  },
});
