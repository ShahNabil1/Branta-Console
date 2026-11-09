// Project contracts: drafts, publish (CEO signature + expiring signing link), versions,
// per-company contract settings. Public signing lives in /api/public/contracts/$token.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { dbError } from "@/lib/db-errors";
import { isGroupAdmin } from "@/lib/group-admin";
import { autoInvoice, dhakaDate, fillTemplate, isLinkExpired, type ContractContext, type ContractForm, type ContractStatus, type ContractWorkspace } from "@/lib/contract-template";

type Sb = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const Id = z.string().uuid();
const zp = <T extends z.ZodTypeAny>(s: T, d: unknown): z.infer<T> => {
  const r = s.safeParse(d);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
};
const Form = z.object({
  scope: z.string().max(8000), video_length: z.string().max(200), revisions: z.string().max(200),
  fee: z.string().max(200), special_terms: z.string().max(8000), delivery_date: z.string().max(100),
});

async function canPublish(sb: Sb, projectId: string, userId: string) {
  const [{ data: m }, { data: r }] = await Promise.all([
    sb.rpc("can_manage_project", { _project_id: projectId, _user: userId }),
    sb.rpc("has_project_role", { _project_id: projectId, _user: userId, _roles: ["project_head", "team_lead"] }),
  ]);
  return !!m || !!r;
}

async function loadProject(sb: Sb, projectId: string) {
  const { data: p, error } = await sb.from("client_projects")
    .select("id,title,service,notes,due_on,company_id,customer_id,customers(name,company,email,phone,contact_person)")
    .eq("id", projectId).maybeSingle();
  if (error) throw dbError(error);
  if (!p) throw new Error("Project not found");
  return p;
}

export const getContractWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => zp(z.object({ projectId: Id }), d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const p = await loadProject(sb, data.projectId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ad = supabaseAdmin as Sb;
    const [{ data: co }, { data: settings }, { data: invs }, { data: contracts, error }] = await Promise.all([
      ad.from("companies").select("id,name,email,phone,website_url,address,logo_url").eq("id", p.company_id).maybeSingle(),
      ad.from("company_contract_settings").select("enabled,template_body,ceo_name,ceo_title,ceo_signature_png,expiry_days").eq("company_id", p.company_id).maybeSingle(),
      ad.from("invoices").select("id,slug,total_amount,currency,status,due_date").eq("project_id", data.projectId).is("archived_at", null).order("created_at"),
      sb.from("project_contracts").select("id,title,status,invoice_id,form,current_version,created_at,updated_at,project_contract_versions(id,version,published_at,published_by,expires_at,revoked_at,signer_email,signer_name,signer_title,signed_at)").eq("project_id", data.projectId).order("created_at", { ascending: false }),
    ]);
    if (error) throw dbError(error);
    // Lazily mark expired links.
    const now = new Date();
    for (const c of contracts ?? []) {
      const cur = (c.project_contract_versions ?? []).find((v: any) => v.version === c.current_version);
      if (c.status === "awaiting_signature" && cur && isLinkExpired(cur.expires_at, now)) {
        c.status = "expired";
        await ad.from("project_contracts").update({ status: "expired" }).eq("id", c.id).eq("status", "awaiting_signature");
      }
      c.project_contract_versions?.sort((a: any, b: any) => b.version - a.version);
    }
    const ids = [...new Set((contracts ?? []).flatMap((c: any) => (c.project_contract_versions ?? []).map((v: any) => v.published_by)))];
    const { data: people } = ids.length ? await ad.from("profiles").select("user_id,full_name").in("user_id", ids) : { data: [] };
    const nameOf = Object.fromEntries((people ?? []).map((x: any) => [x.user_id, x.full_name]));
    const cust = p.customers ?? {};
    const ctx: ContractContext = {
      company_name: co?.name ?? "", client_name: cust.contact_person || cust.name || "", client_company: cust.company ?? "",
      client_email: cust.email ?? "", client_phone: cust.phone ?? "", project_name: p.title, service: p.service ?? "",
      project_description: p.notes ?? "", invoice_no: "", date: dhakaDate(),
    };
    const out: ContractWorkspace = {
      ctx, dueOn: p.due_on as string | null,
      canPublish: await canPublish(sb, data.projectId, context.userId),
      settings: settings ? { enabled: settings.enabled, template: settings.template_body as string, ceoName: settings.ceo_name, ceoTitle: settings.ceo_title, hasSignature: !!settings.ceo_signature_png, expiryDays: settings.expiry_days } : null,
      invoices: (invs ?? []).map((i: any) => ({ id: i.id, slug: i.slug, total: Number(i.total_amount), currency: i.currency, status: i.status, due: i.due_date })),
      autoInvoiceId: autoInvoice(invs ?? []),
      contracts: (contracts ?? []).map((c: any) => ({
        id: c.id, title: c.title, status: c.status as ContractStatus, invoiceId: c.invoice_id, form: c.form as ContractForm, currentVersion: c.current_version, updatedAt: c.updated_at,
        versions: (c.project_contract_versions ?? []).map((v: any) => ({ ...v, published_by_name: nameOf[v.published_by] ?? "Team member" })),
      })),
    };
    return out;
  });

export const saveContractDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => zp(z.object({ projectId: Id, id: Id.nullable(), title: z.string().trim().min(2).max(160), invoiceId: Id.nullable(), form: Form }), d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    if (!(await canPublish(sb, data.projectId, context.userId))) throw new Error("Only the project's Coordinator, Team Lead or a manager can edit contracts.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ad = supabaseAdmin as Sb;
    if (data.invoiceId) {
      const { data: inv } = await ad.from("invoices").select("project_id").eq("id", data.invoiceId).maybeSingle();
      if (inv?.project_id !== data.projectId) throw new Error("That invoice does not belong to this project.");
    }
    const row = { title: data.title, invoice_id: data.invoiceId, form: data.form };
    if (data.id) {
      const { data: c } = await ad.from("project_contracts").select("status,project_id").eq("id", data.id).maybeSingle();
      if (!c || c.project_id !== data.projectId) throw new Error("Contract not found");
      if (c.status === "signed") throw new Error("A signed contract cannot be edited.");
      const { error } = await ad.from("project_contracts").update(row).eq("id", data.id);
      if (error) throw dbError(error);
      return { id: data.id };
    }
    const { data: p } = await sb.from("client_projects").select("company_id").eq("id", data.projectId).maybeSingle();
    const { data: ins, error } = await ad.from("project_contracts").insert({ ...row, project_id: data.projectId, company_id: p?.company_id ?? null, created_by: context.userId }).select("id").single();
    if (error) throw dbError(error);
    await ad.from("client_project_activity").insert({ project_id: data.projectId, actor_id: context.userId, action: "contract", body: `Created contract draft "${data.title}"` });
    return { id: ins.id as string };
  });

export const publishContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => zp(z.object({ id: Id }), d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ad = supabaseAdmin as Sb;
    const { data: c } = await ad.from("project_contracts").select("*").eq("id", data.id).maybeSingle();
    if (!c) throw new Error("Contract not found");
    if (!(await canPublish(sb, c.project_id, context.userId))) throw new Error("Only the project's Coordinator, Team Lead or a manager can publish contracts.");
    if (c.status === "signed") throw new Error("This contract is already signed. Create a new contract for changes.");
    const p = await loadProject(sb, c.project_id);
    const [{ data: co }, { data: st }] = await Promise.all([
      ad.from("companies").select("id,name,email,phone,website_url,address").eq("id", p.company_id).maybeSingle(),
      ad.from("company_contract_settings").select("*").eq("company_id", p.company_id).maybeSingle(),
    ]);
    if (!st?.enabled) throw new Error("Contracts are not set up for this company yet.");
    if (!st.ceo_name || !st.ceo_signature_png) throw new Error("Add the CEO's name and signature in Company → Contracts settings first.");
    const cust = p.customers ?? {};
    const email = String(cust.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("The client has no valid email on their profile.");
    let invoice = null;
    if (c.invoice_id) {
      const { data: i } = await ad.from("invoices").select("slug,total_amount,currency,due_date").eq("id", c.invoice_id).maybeSingle();
      if (i) invoice = { slug: i.slug, total: Number(i.total_amount), currency: i.currency, due_date: i.due_date };
    }
    const ctx: ContractContext = {
      company_name: co?.name ?? "", client_name: cust.contact_person || cust.name || "", client_company: cust.company ?? "",
      client_email: email, client_phone: cust.phone ?? "", project_name: p.title, service: p.service ?? "",
      project_description: p.notes ?? "", invoice_no: invoice?.slug ?? "To be issued", date: dhakaDate(),
    };
    const form = { ...(c.form as ContractForm), delivery_date: (c.form as ContractForm)?.delivery_date || p.due_on || "" };
    const version = (c.current_version ?? 0) + 1;
    const { randomToken, sha256Hex, sendContractEmail, emailShell, esc } = await import("@/lib/contracts.server");
    const { publicBase } = await import("@/lib/company-email.server");
    const now = new Date();
    const snapshot = {
      title: c.title, version,
      company: { id: co?.id ?? null, name: co?.name ?? "", address: co?.address ?? null, email: co?.email ?? null, phone: co?.phone ?? null, website: co?.website_url ?? null, logo_url: co?.logo_url ?? null },
      client: { name: ctx.client_name, company: ctx.client_company, email, phone: ctx.client_phone },
      project: { id: p.id, name: p.title },
      body: fillTemplate(st.template_body, ctx, form), invoice,
      ceo: { name: st.ceo_name, title: st.ceo_title ?? "Chief Executive Officer", signature_png: st.ceo_signature_png },
      published_at: now.toISOString(),
    };
    const token = randomToken();
    const expires = new Date(now.getTime() + st.expiry_days * 86400000);
    // Revoke earlier open links, then add the new immutable version.
    await ad.from("project_contract_versions").update({ revoked_at: now.toISOString() }).eq("contract_id", c.id).is("signed_at", null).is("revoked_at", null);
    const { error: vErr } = await ad.from("project_contract_versions").insert({
      contract_id: c.id, version, snapshot, published_by: context.userId, published_at: now.toISOString(),
      token_hash: await sha256Hex(token), expires_at: expires.toISOString(), signer_email: email,
    });
    if (vErr) throw dbError(vErr);
    const { error: cErr } = await ad.from("project_contracts").update({ status: "awaiting_signature", current_version: version }).eq("id", c.id);
    if (cErr) throw dbError(cErr);
    const link = `${publicBase()}/sign/${token}`;
    await ad.from("client_project_activity").insert({ project_id: c.project_id, actor_id: context.userId, action: "contract", body: `Published contract "${c.title}" v${version} for signature` });
    let emailed = true;
    try {
      await sendContractEmail(p.company_id, email, `Please review and sign: ${c.title}`,
        emailShell(co?.name ?? "Contract", "Your contract is ready to sign", `Hello ${esc(ctx.client_name || "there")},<br/>Please review and sign <b>${esc(c.title)}</b>. This link stays valid until ${esc(dhakaDate(expires))}.`, { href: link, label: "Review & sign" }));
    } catch (e) { console.error("contract email failed", e); emailed = false; }
    return { link, version, emailed, email };
  });

export const downloadContractPdf = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => zp(z.object({ versionId: Id }), d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: v, error } = await sb.from("project_contract_versions").select("*").eq("id", data.versionId).maybeSingle();
    if (error) throw dbError(error);
    if (!v) throw new Error("Contract version not found");
    const { renderContractPdf } = await import("@/lib/contracts.server");
    const signed = v.signed_at ? { name: v.signer_name, title: v.signer_title, email: v.signer_email, signed_at: v.signed_at, ip: v.signer_ip, signature_png: v.signature_png } : null;
    const bytes = await renderContractPdf(v.snapshot, signed, v.pdf_sha256 ?? undefined);
    let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
    return { base64: btoa(bin), filename: `${v.snapshot.title.replace(/[^\w-]+/g, "-")}-v${v.version}${signed ? "-signed" : ""}.pdf` };
  });

// ---------- per-company settings ----------
export const getContractSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => zp(z.object({ companyId: Id }), d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: s } = await sb.from("company_contract_settings").select("*").eq("company_id", data.companyId).maybeSingle();
    return {
      canEdit: await isGroupAdmin(sb, context.userId),
      enabled: s?.enabled ?? false, template: s?.template_body ?? "", ceoName: s?.ceo_name ?? "", ceoTitle: s?.ceo_title ?? "Chief Executive Officer",
      signature: (s?.ceo_signature_png as string | null) ?? null, expiryDays: s?.expiry_days ?? 14,
    };
  });

export const saveContractSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => zp(z.object({
    companyId: Id, enabled: z.boolean(), template: z.string().max(40000), ceoName: z.string().trim().max(120), ceoTitle: z.string().trim().max(120),
    signature: z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Signature must be a PNG image").max(400000).nullable(),
    expiryDays: z.number().int().min(1).max(90),
  }), d))
  .handler(async ({ data, context }) => {
    if (!(await isGroupAdmin(context.supabase, context.userId))) throw new Error("Only Group Admins can change contract settings.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as Sb).from("company_contract_settings").upsert({
      company_id: data.companyId, enabled: data.enabled, template_body: data.template, ceo_name: data.ceoName || null, ceo_title: data.ceoTitle || null,
      ceo_signature_png: data.signature, expiry_days: data.expiryDays, updated_by: context.userId,
    });
    if (error) throw dbError(error);
    return { ok: true };
  });
