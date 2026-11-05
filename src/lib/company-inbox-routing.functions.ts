// In-app Gmail Inbox Address verified through the company's connected Cloudflare Email Routing
// (routing on → destination Gmail verified → literal forward rule). Group-admin gated; tokens server-only.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const Slug = z.string().trim().min(1).max(80);

async function gate(ctx: { supabase: unknown; userId: string }, slug: string) {
  const sb = ctx.supabase as Any;
  const { data: co } = await sb.from("companies").select("id, slug, name").eq("slug", slug).maybeSingle();
  if (!co) throw new Error("Company not found.");
  const { assertGroupAdmin } = await import("@/lib/group-admin");
  await assertGroupAdmin(sb, ctx.userId, "Only Branta Tech group admins can manage company integrations.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { co: co as { id: string; slug: string; name: string }, admin: supabaseAdmin as Any };
}

async function gmailTarget(companyId: string) {
  const { getAccount } = await import("@/lib/company-google.server");
  const a = await getAccount(companyId).catch(() => null);
  return a?.is_active && a.refresh_token_enc ? String(a.google_email).toLowerCase() : null;
}

/** Domains in the connected Cloudflare account (for the locked suffix / dropdown). */
export const getInboxDomains = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ slug: Slug }).parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const cf = await import("@/lib/company-cloudflare.server");
    const token = await cf.companyCloudflareToken(co.id).catch(() => null);
    const { data: ib } = await admin.from("company_inbox_addresses").select("sender_name").eq("company_id", co.id).maybeSingle();
    const senderName = (ib?.sender_name as string | null) || co.name;
    if (!token) return { connected: false, domains: [] as { id: string; name: string }[], senderName };
    const { result } = await cf.cfApi<Any[]>(token, "/zones?per_page=50");
    return { connected: true, domains: (result ?? []).map((z) => ({ id: String(z.id), name: String(z.name).toLowerCase() })), senderName };
  });

export type RoutingStep = { id: "routing" | "destination" | "rule"; label: string; ok: boolean; detail: string };
export type RoutingResult = {
  stage: "verified" | "routing_off" | "destination_pending" | "failed";
  message: string;
  steps: RoutingStep[];
};

/**
 * Checks and repairs Cloudflare Email Routing for <local>@<domain> → company Gmail.
 * Routing off: reports routing_off unless enableRouting. Destination missing: adds it (Cloudflare emails
 * a confirmation link) and reports destination_pending. Rule missing: creates it. Then marks verified.
 */
export const verifyInboxRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      slug: Slug,
      local: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/, "Use letters, numbers, dots or dashes."),
      domain: z.string().trim().toLowerCase().min(3).max(253),
      senderName: z.string().trim().min(1).max(80).refine((v) => !/[<>"\r\n]/.test(v), "Sender name has invalid characters."),
      enableRouting: z.boolean().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }): Promise<RoutingResult> => {
    const { co, admin } = await gate(context, data.slug);
    const gmail = await gmailTarget(co.id);
    if (!gmail) throw new Error("Connect this company's Google account first.");
    const email = `${data.local}@${data.domain}`;
    if (email === gmail) throw new Error("Use the company address, not the Gmail itself.");
    const cf = await import("@/lib/company-cloudflare.server");
    const token = await cf.companyCloudflareToken(co.id);
    if (!token) throw new Error("Connect Cloudflare first.");
    const { result: zones } = await cf.companyCfApi<Any[]>(co.id, `/zones?name=${encodeURIComponent(data.domain)}`);
    const zone = zones?.[0];
    if (!zone) throw new Error(`${data.domain} is not in the connected Cloudflare account.`);

    // Save address + sender name; a changed address is no longer verified.
    const { data: cur } = await admin.from("company_inbox_addresses").select("email").eq("company_id", co.id).maybeSingle();
    const patch: Any = { company_id: co.id, email, sender_name: data.senderName, probe_code: null, updated_by: context.userId };
    if (!cur || cur.email !== email) patch.verified_at = null;
    const { error } = await admin.from("company_inbox_addresses").upsert(patch, { onConflict: "company_id" });
    if (error) throw new Error("Could not save the Inbox address.");

    const steps: RoutingStep[] = [];
    const fail = (message: string): RoutingResult => ({ stage: "failed", message, steps });
    try {
      // 1. Email Routing on the zone
      let er = (await cf.companyCfApi<Any>(co.id, `/zones/${zone.id}/email/routing`)).result;
      if (!er?.enabled) {
        if (!data.enableRouting) {
          steps.push({ id: "routing", label: "Email Routing", ok: false, detail: `Email Routing is off for ${data.domain}.` });
          return { stage: "routing_off", message: `Email Routing is off for ${data.domain}. Turn it on to continue.`, steps };
        }
        er = (await cf.companyCfApi<Any>(co.id, `/zones/${zone.id}/email/routing/dns`, { method: "POST", body: "{}" })
          .catch(() => cf.companyCfApi<Any>(co.id, `/zones/${zone.id}/email/routing/enable`, { method: "POST", body: "{}" }))).result;
      }
      steps.push({ id: "routing", label: "Email Routing", ok: true, detail: `On for ${data.domain}.` });

      // 2. Destination address (account level)
      const acct = String(zone.account?.id ?? "");
      const { result: dests } = await cf.companyCfApi<Any[]>(co.id, `/accounts/${acct}/email/routing/addresses?per_page=50`);
      let dest = (dests ?? []).find((d) => String(d.email).toLowerCase() === gmail);
      if (!dest) dest = (await cf.companyCfApi<Any>(co.id, `/accounts/${acct}/email/routing/addresses`, { method: "POST", body: JSON.stringify({ email: gmail }) })).result;
      if (!dest?.verified) {
        steps.push({ id: "destination", label: "Destination address", ok: false, detail: `Cloudflare sent a confirmation email to ${gmail}. Open it and click "Verify email address".` });
        return { stage: "destination_pending", message: `Waiting for ${gmail} to be confirmed in Cloudflare…`, steps };
      }
      steps.push({ id: "destination", label: "Destination address", ok: true, detail: `${gmail} is verified.` });

      // 3. Routing rule: literal to=<email> → forward gmail
      const { result: rules } = await cf.companyCfApi<Any[]>(co.id, `/zones/${zone.id}/email/routing/rules?per_page=50`);
      const hit = (rules ?? []).find((r) =>
        r.enabled !== false &&
        (r.matchers ?? []).some((m: Any) => m.type === "literal" && m.field === "to" && String(m.value).toLowerCase() === email) &&
        (r.actions ?? []).some((a: Any) => a.type === "forward" && (a.value ?? []).map((v: string) => v.toLowerCase()).includes(gmail)));
      if (!hit) {
        await cf.companyCfApi(co.id, `/zones/${zone.id}/email/routing/rules`, {
          method: "POST",
          body: JSON.stringify({ name: `Branta Console: ${email} → ${gmail}`, enabled: true, matchers: [{ type: "literal", field: "to", value: email }], actions: [{ type: "forward", value: [gmail] }] }),
        });
        steps.push({ id: "rule", label: "Routing rule", ok: true, detail: `Created ${email} → ${gmail}.` });
      } else steps.push({ id: "rule", label: "Routing rule", ok: true, detail: `${email} → ${gmail} exists.` });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Cloudflare request failed.");
    }

    await admin.from("company_inbox_addresses").update({ verified_at: new Date().toISOString(), updated_by: context.userId }).eq("company_id", co.id);
    return { stage: "verified", message: `${email} forwards to ${gmail}.`, steps };
  });
