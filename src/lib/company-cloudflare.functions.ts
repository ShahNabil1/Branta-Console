// Company Integrations → Cloudflare account (DNS + Email Routing). Group-admin gated; tokens stay server-side.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { RecordIn, dnsPayload } from "@/lib/cloudflare-dns";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const Slug = z.object({ slug: z.string().trim().min(1).max(80) });

export type CloudflareConnection = {
  email: string | null; accounts: string[]; scopes: string[]; connected_at: string;
  last_checked_at: string | null; last_error: string | null;
} | null;

async function gate(ctx: { supabase: unknown; userId: string }, slug: string) {
  const sb = ctx.supabase as Any;
  const { data: co } = await sb.from("companies").select("id, slug, name").eq("slug", slug).maybeSingle();
  if (!co) throw new Error("Company not found.");
  const { assertCompanyOperator } = await import("@/lib/group-admin");
  await assertCompanyOperator(sb, ctx.userId, (co as { id: string }).id);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { co: co as { id: string; slug: string; name: string }, admin: supabaseAdmin as Any };
}

function view(a: Any): CloudflareConnection {
  if (!a?.is_active || !a.refresh_token_enc) return null;
  return { email: a.cf_email, accounts: a.account_names ?? [], scopes: a.scopes ?? [], connected_at: a.connected_at, last_checked_at: a.last_checked_at, last_error: a.last_error };
}

export const getCloudflareConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Slug.parse(i))
  .handler(async ({ data, context }) => {
    const { co } = await gate(context, data.slug);
    const cf = await import("@/lib/company-cloudflare.server");
    return { configured: cf.cloudflareOAuthConfigured(), account: view(await cf.getAccount(co.id)) };
  });

export const startCloudflareConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Slug.extend({ popupId: z.string().uuid().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { co } = await gate(context, data.slug);
    const cf = await import("@/lib/company-cloudflare.server");
    const origin = new URL(getRequest().url).origin;
    const state = await cf.signState({ c: co.id, s: co.slug, u: context.userId, o: origin, p: data.popupId });
    return { url: cf.authUrl(state, origin) };
  });

/** Live check: refresh the token, list domains and read Email Routing on the first one. */
export const testCloudflareConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Slug.parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const cf = await import("@/lib/company-cloudflare.server");
    const checks: { id: string; label: string; ok: boolean; detail: string; zone?: string; off?: boolean }[] = [];
    let token: string | null = null;
    try {
      cf.clearCache(co.id);
      token = await cf.companyCloudflareToken(co.id);
      checks.push({ id: "token", label: "Cloudflare access", ok: !!token, detail: token ? "Access refreshed." : "No Cloudflare account connected." });
    } catch (e) {
      checks.push({ id: "token", label: "Cloudflare access", ok: false, detail: e instanceof Error ? e.message : "Refresh failed." });
    }
    if (token) {
      try {
        const { result: zones, info } = await cf.cfApi<Any[]>(token, "/zones?per_page=50");
        const n = Number(info?.total_count ?? zones.length);
        checks.push({ id: "dns", label: "Domains & DNS", ok: true, detail: n ? `${n} domain${n === 1 ? "" : "s"}: ${zones.slice(0, 3).map((z) => z.name).join(", ")}${n > 3 ? "…" : ""}` : "Connected, but no domains in this account." });
        if (zones[0]) {
          await cf.cfApi(token, `/zones/${zones[0].id}/dns_records?per_page=1`);
          const er = await cf.cfApi<Any>(token, `/zones/${zones[0].id}/email/routing`).then((r) => r.result).catch((e: Error) => ({ error: e.message }));
          checks.push({ id: "routing", label: "Email Routing", ok: !er?.error && !!er?.enabled, detail: er?.error ?? (er?.enabled ? `On for ${zones[0].name}.` : `Off for ${zones[0].name}.`), ...(er?.error ? {} : { zone: zones[0].name, off: !er?.enabled }) });
        }
      } catch (e) {
        checks.push({ id: "dns", label: "Domains & DNS", ok: false, detail: e instanceof Error ? e.message : "Could not list domains." });
      }
    }
    const ok = checks.every((c) => c.ok);
    await admin.from("company_cloudflare_accounts").update({ last_checked_at: new Date().toISOString(), last_error: ok ? null : checks.find((c) => !c.ok)?.detail ?? null }).eq("company_id", co.id);
    return { ok, checks };
  });

export const disconnectCloudflare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Slug.parse(i))
  .handler(async ({ data, context }) => {
    const { co, admin } = await gate(context, data.slug);
    const cf = await import("@/lib/company-cloudflare.server");
    const { open } = await import("@/lib/company-email.server");
    const acc = await cf.getAccount(co.id);
    if (acc?.refresh_token_enc) { const t = await open(acc.refresh_token_enc).catch(() => null); if (t) await cf.revoke(t); }
    cf.clearCache(co.id);
    // Keep the row as history; drop the credential.
    await admin.from("company_cloudflare_accounts").update({ is_active: false, refresh_token_enc: null, disconnected_at: new Date().toISOString() }).eq("company_id", co.id);
    return { ok: true };
  });

/** Turns on Email Routing for one zone in the company's Cloudflare account. */
export const enableCloudflareRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Slug.extend({ zone: z.string().trim().min(1).max(253) }).parse(i))
  .handler(async ({ data, context }) => {
    const { co } = await gate(context, data.slug);
    const cf = await import("@/lib/company-cloudflare.server");
    const { result: zones } = await cf.companyCfApi<Any[]>(co.id, `/zones?name=${encodeURIComponent(data.zone)}`);
    const zone = zones?.[0];
    if (!zone) throw new Error(`${data.zone} is not in the connected Cloudflare account.`);
    await cf.companyCfApi(co.id, `/zones/${zone.id}/email/routing/dns`, { method: "POST", body: "{}" })
      .catch(() => cf.companyCfApi(co.id, `/zones/${zone.id}/email/routing/enable`, { method: "POST", body: "{}" }));
    const er = (await cf.companyCfApi<Any>(co.id, `/zones/${zone.id}/email/routing`)).result;
    if (!er?.enabled) throw new Error(`Cloudflare has not turned on Email Routing for ${data.zone} yet. Try again shortly.`);
    return { ok: true };
  });

// ---------- DNS management (zones + records) ----------
export type DnsRecord = {
  id: string; type: string; name: string; content: string; proxied: boolean; proxiable: boolean;
  ttl: number; priority: number | null; comment: string | null; data: Record<string, unknown> | null;
};
const ZoneIn = Slug.extend({ zone: z.string().trim().regex(/^[a-f0-9]{32}$/i) });
const mapRec = (r: Any): DnsRecord => ({
  id: r.id, type: r.type, name: r.name, content: String(r.content ?? ""), proxied: !!r.proxied, proxiable: !!r.proxiable,
  ttl: Number(r.ttl ?? 1), priority: r.priority ?? null, comment: r.comment ?? null, data: r.data ?? null,
});

export const listCloudflareZones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Slug.parse(i))
  .handler(async ({ data, context }) => {
    const { co } = await gate(context, data.slug);
    const cf = await import("@/lib/company-cloudflare.server");
    const out: { id: string; name: string; status: string }[] = [];
    for (let page = 1; page <= 10; page++) {
      const { result, info } = await cf.companyCfApi<Any[]>(co.id, `/zones?per_page=50&page=${page}`);
      out.push(...(result ?? []).map((z: Any) => ({ id: String(z.id), name: String(z.name), status: String(z.status ?? "") })));
      if (!info || page >= (info.total_pages ?? 1)) break;
    }
    return out;
  });

export const listDnsRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ZoneIn.parse(i))
  .handler(async ({ data, context }) => {
    const { co } = await gate(context, data.slug);
    const cf = await import("@/lib/company-cloudflare.server");
    const out: DnsRecord[] = [];
    for (let page = 1; page <= 50; page++) {
      const { result, info } = await cf.companyCfApi<Any[]>(co.id, `/zones/${data.zone}/dns_records?per_page=500&page=${page}`);
      out.push(...(result ?? []).map(mapRec));
      if (!info || page >= (info.total_pages ?? 1)) break;
    }
    return out;
  });

export const saveDnsRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ZoneIn.extend({ id: z.string().regex(/^[a-f0-9]{32}$/i).optional(), record: RecordIn }).parse(i))
  .handler(async ({ data, context }) => {
    const { co } = await gate(context, data.slug);
    const cf = await import("@/lib/company-cloudflare.server");
    const body = JSON.stringify(dnsPayload(data.record));
    const path = `/zones/${data.zone}/dns_records${data.id ? `/${data.id}` : ""}`;
    const { result } = await cf.companyCfApi<Any>(co.id, path, { method: data.id ? "PUT" : "POST", body });
    return mapRec(result);
  });

export const deleteDnsRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ZoneIn.extend({ id: z.string().regex(/^[a-f0-9]{32}$/i) }).parse(i))
  .handler(async ({ data, context }) => {
    const { co } = await gate(context, data.slug);
    const cf = await import("@/lib/company-cloudflare.server");
    await cf.companyCfApi(co.id, `/zones/${data.zone}/dns_records/${data.id}`, { method: "DELETE" });
    return { ok: true };
  });
