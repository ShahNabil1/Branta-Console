import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ slug: z.string().trim().min(1).max(80), provider: z.enum(["resend", "brevo"]) });
async function gate(context: { supabase: unknown; userId: string }, slug: string) {
  const sb = context.supabase as any;
  const { assertGroupAdmin } = await import("./group-admin");
  await assertGroupAdmin(sb, context.userId, "Only group admins can repair company integrations.");
  const { data: company } = await sb.from("companies").select("id,name").eq("slug", slug).maybeSingle();
  if (!company) throw new Error("Company not found.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const { data: inbox } = await admin.from("company_inbox_addresses").select("email,sender_name,verified_at").eq("company_id", company.id).maybeSingle();
  if (!inbox?.verified_at) throw new Error("Verify this company's Inbox address first.");
  return { admin, company, email: String(inbox.email).toLowerCase(), name: inbox.sender_name || company.name };
}

export const repairProviderApi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.extend({ mode: z.enum(["oauth", "manual"]), apiKey: z.string().trim().min(1).max(500).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { admin, company, email, name } = await gate(context, data.slug);
    const m = await import("./company-email.server");
    let key = data.apiKey;
    if (data.mode === "oauth") {
      if (data.provider !== "resend") throw new Error("Use a manual Brevo API key.");
      const rs = await import("./company-resend.server");
      const token = await rs.companyResendToken(company.id);
      if (!token) throw new Error("Connect Resend first.");
      const created = await rs.rs(token, "/api-keys", { method: "POST", body: { name: `Branta Console · ${company.name}`.slice(0, 50), permission: "full_access" } });
      if (!created.ok || !created.body?.token) throw new Error(`Resend ${created.status}: ${created.body?.message ?? "Could not create a full-access key."}`);
      key = created.body.token;
    }
    if (!key || !key.startsWith(data.provider === "resend" ? "re_" : "xkeysib-")) throw new Error("Enter a valid provider API key.");
    const check = data.provider === "resend" ? await m.resend(key, "/domains") : await m.brevo(key, "/account");
    if (!check.ok) throw new Error(`${data.provider} ${check.status}: ${check.body?.message ?? "API key rejected"}`);
    const { data: saved, error } = await admin.from("company_email_providers").update({
      api_key_enc: await m.seal(key), api_key_hint: null, sender_email: email, sender_name: name,
      domain: email.split("@")[1], updated_by: context.userId,
    }).eq("company_id", company.id).eq("provider", data.provider).eq("is_active", true).select("id").maybeSingle();
    if (error || !saved) throw new Error("Could not save the repaired API connection.");
    return { ok: true };
  });

export const repairProviderDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.extend({ subdomain: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/) }).parse(i))
  .handler(async ({ data, context }) => {
    const { admin, company, email, name } = await gate(context, data.slug);
    const m = await import("./company-email.server");
    const { data: provider } = await admin.from("company_email_providers").select("api_key_enc").eq("company_id", company.id).eq("provider", data.provider).eq("is_active", true).maybeSingle();
    const key = await m.open(provider?.api_key_enc);
    if (!key) throw new Error("Fix the API connection first.");
    const domain = email.split("@")[1];
    const rs = await import("./company-resend.server");
    const { repairResendDomain, repairBrevoDomain } = await import("./provider-repair");
    const push = (records: any[]) => rs.pushResendDns(company.id, domain, records);
    const result = data.provider === "resend"
      ? await repairResendDomain(domain, data.subdomain, (path, init) => m.resend(key, path, init), push)
      : await repairBrevoDomain(domain, email, name, (path, init) => m.brevo(key, path, init), push);
    const { error } = await admin.from("company_email_providers").update({ sender_name: name, sender_email: email, domain,
      domain_verified_at: result.ok ? new Date().toISOString() : null, updated_by: context.userId,
    }).eq("company_id", company.id).eq("provider", data.provider);
    if (error) throw new Error("Could not save the domain verification result.");
    return result;
  });