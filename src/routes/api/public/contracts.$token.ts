// Public contract signing API. The token (hashed in DB) identifies one contract version;
// signing requires an emailed one-time code. Never returns other project data.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { "Cache-Control": "no-store" } });

async function load(token: string) {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null;
  const { sha256Hex } = await import("@/lib/contracts.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ad = supabaseAdmin as Sb;
  const { data: v } = await ad.from("project_contract_versions").select("*").eq("token_hash", await sha256Hex(token)).maybeSingle();
  return v ? { v, ad } : null;
}
const state = (v: any) => (v.signed_at ? "signed" : v.revoked_at ? "replaced" : new Date(v.expires_at) <= new Date() ? "expired" : "open");
const maskEmail = (e: string) => e.replace(/^(.).*?(.)?@/, (_m, a, b) => `${a}•••${b ?? ""}@`);

export const Route = createFileRoute("/api/public/contracts/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const r = await load(params.token);
        if (!r) return json({ error: "This signing link is not valid." }, 404);
        const { v } = r;
        const s = v.snapshot;
        if (new URL(request.url).searchParams.get("pdf") === "1") {
          if (!v.signed_at && state(v) !== "open") return json({ error: "Unavailable" }, 410);
          const { renderContractPdf } = await import("@/lib/contracts.server");
          const signed = v.signed_at ? { name: v.signer_name, title: v.signer_title, email: v.signer_email, signed_at: v.signed_at, ip: v.signer_ip, signature_png: v.signature_png } : null;
          const bytes = await renderContractPdf(s, signed, v.pdf_sha256 ?? undefined);
          return new Response(bytes as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${s.title.replace(/[^\w-]+/g, "-")}-v${v.version}.pdf"`, "Cache-Control": "no-store" } });
        }
        const st = state(v);
        return json({
          state: st, title: s.title, version: v.version, company: s.company, client: { name: s.client.name, company: s.client.company },
          body: st === "open" || st === "signed" ? s.body : null, invoice: s.invoice, ceo: { name: s.ceo.name, title: s.ceo.title, signature_png: s.ceo.signature_png },
          email: maskEmail(v.signer_email), expires_at: v.expires_at,
          signed: v.signed_at ? { name: v.signer_name, title: v.signer_title, at: v.signed_at, signature_png: v.signature_png } : null,
        });
      },
      POST: async ({ request, params }) => {
        const r = await load(params.token);
        if (!r) return json({ error: "This signing link is not valid." }, 404);
        const { v, ad } = r;
        const st = state(v);
        if (st !== "open") return json({ error: st === "signed" ? "This contract is already signed." : st === "replaced" ? "A newer version replaced this contract. Please use the latest link." : "This signing link has expired. Please ask for a new one." }, 410);
        const body = await request.json().catch(() => null);
        const parsed = z.discriminatedUnion("action", [
          z.object({ action: z.literal("send_code") }),
          z.object({ action: z.literal("verify"), code: z.string().regex(/^\d{6}$/) }),
          z.object({ action: z.literal("submit"), session: z.string().min(20).max(80), name: z.string().trim().min(2).max(120), title: z.string().trim().max(120).optional(), agree: z.literal(true),
            signature: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).max(300000) }),
        ]).safeParse(body);
        if (!parsed.success) return json({ error: "Please check the details and try again." }, 400);
        const C = await import("@/lib/contracts.server");
        const T = await import("@/lib/contract-template");
        const d = parsed.data;
        if (d.action === "send_code") {
          const since = new Date(Date.now() - 3600_000).toISOString();
          const { count } = await ad.from("contract_otp_challenges").select("id", { count: "exact", head: true }).eq("version_id", v.id).gte("created_at", since);
          if ((count ?? 0) >= 5) return json({ error: "Too many codes requested. Please wait an hour." }, 429);
          const code = C.randomCode();
          await ad.from("contract_otp_challenges").insert({ version_id: v.id, code_hash: await C.sha256Hex(`${v.id}:${code}`), expires_at: new Date(Date.now() + T.OTP_TTL_MS).toISOString() });
          try {
            await C.sendContractEmail(v.snapshot.company.id, v.signer_email, `Your signing code: ${code}`,
              C.emailShell(v.snapshot.company.name, "Your verification code", `Use this code to sign <b>${C.esc(v.snapshot.title)}</b>:<br/><span style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</span><br/>It expires in 10 minutes.`));
          } catch (e) { console.error("otp email", e); return json({ error: "We could not send the code. Please try again shortly." }, 502); }
          return json({ ok: true, email: maskEmail(v.signer_email) });
        }
        if (d.action === "verify") {
          const { data: c } = await ad.from("contract_otp_challenges").select("*").eq("version_id", v.id).is("verified_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (!c || !T.otpUsable(c)) return json({ error: "This code has expired or was tried too many times. Request a new one." }, 400);
          if (c.code_hash !== await C.sha256Hex(`${v.id}:${d.code}`)) {
            await ad.from("contract_otp_challenges").update({ attempts: c.attempts + 1 }).eq("id", c.id);
            return json({ error: `Incorrect code. ${T.OTP_MAX_ATTEMPTS - c.attempts - 1} tries left.` }, 400);
          }
          const session = C.randomToken(24);
          await ad.from("contract_otp_challenges").update({ verified_at: new Date().toISOString(), session_hash: await C.sha256Hex(session) }).eq("id", c.id);
          return json({ ok: true, session });
        }
        // submit
        const { data: ok } = await ad.from("contract_otp_challenges").select("id,verified_at").eq("version_id", v.id).eq("session_hash", await C.sha256Hex(d.session)).maybeSingle();
        if (!ok?.verified_at || Date.now() - new Date(ok.verified_at).getTime() > 60 * 60_000) return json({ error: "Please verify your email again." }, 401);
        const signedAt = new Date().toISOString();
        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
        const hash = await C.sha256Hex(JSON.stringify({ snapshot: v.snapshot, signer: d.name, at: signedAt, sig: d.signature }));
        const { data: upd, error } = await ad.from("project_contract_versions").update({
          signer_name: d.name, signer_title: d.title || null, signed_at: signedAt, signer_ip: ip, signer_ua: request.headers.get("user-agent")?.slice(0, 300) ?? null,
          signature_png: d.signature, pdf_sha256: hash,
        }).eq("id", v.id).is("signed_at", null).is("revoked_at", null).select("contract_id").maybeSingle();
        if (error || !upd) return json({ error: "This contract could not be signed. It may already be signed." }, 409);
        const { data: k } = await ad.from("project_contracts").update({ status: "signed" }).eq("id", v.contract_id).select("project_id,title").single();
        await ad.from("client_project_activity").insert({ project_id: k.project_id, actor_id: null, action: "contract", body: `${d.name} signed contract "${k.title}" v${v.version}` });
        return json({ ok: true });
      },
    },
  },
});
