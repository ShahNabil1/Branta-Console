// Project & Delivery hub (Phase 2): all projects across clients + internal work.
// Never returns money fields — finance stays in client_project_finance / finance-gated APIs.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { dbError } from "@/lib/db-errors";

export const SERVICE_TRACKS = [
  { key: "web_dev", label: "Web Development" },
  { key: "ai_video", label: "AI Video (OVC / TVC)" },
  { key: "ai_automation", label: "AI Automation" },
  { key: "social_media", label: "Social Media / Posters" },
  { key: "other", label: "Other" },
] as const;
export type ServiceTrack = (typeof SERVICE_TRACKS)[number]["key"];

/** Track-specific link/detail fields stored in track_meta. */
export const TRACK_FIELDS: Record<ServiceTrack, { key: string; label: string; kind: "url" | "text" }[]> = {
  web_dev: [
    { key: "repo_url", label: "Repository (GitHub/GitLab)", kind: "url" },
    { key: "staging_url", label: "Staging URL", kind: "url" },
    { key: "production_url", label: "Production URL", kind: "url" },
    { key: "design_url", label: "Design (Figma)", kind: "url" },
    { key: "tech_stack", label: "Tech stack", kind: "text" },
  ],
  ai_video: [
    { key: "script_url", label: "Script / concept doc", kind: "url" },
    { key: "storyboard_url", label: "Storyboard / prompt sheet", kind: "url" },
    { key: "assets_url", label: "Raw assets drive", kind: "url" },
    { key: "format", label: "Resolution / aspect ratio", kind: "text" },
    { key: "duration", label: "Duration", kind: "text" },
  ],
  ai_automation: [
    { key: "platform", label: "Platform (n8n / Make / Zapier / custom)", kind: "text" },
    { key: "blueprint_url", label: "Workflow blueprint / export", kind: "url" },
    { key: "integrations", label: "Connected APIs / apps", kind: "text" },
    { key: "sop_url", label: "Client SOP / guide", kind: "url" },
  ],
  social_media: [
    { key: "calendar_url", label: "Content calendar", kind: "url" },
    { key: "design_board_url", label: "Figma / Canva board", kind: "url" },
    { key: "copy_url", label: "Copywriting sheet", kind: "url" },
    { key: "export_url", label: "Final exports folder", kind: "url" },
  ],
  other: [{ key: "workspace_url", label: "Workspace link", kind: "url" }],
};

export interface HubProject {
  id: string; title: string; category: "client" | "internal"; service_track: ServiceTrack | null;
  service: string | null; status: string; project_type: "one_time" | "monthly";
  customer_id: string | null; customer_code: string | null; client_name: string | null;
  starts_on: string | null; due_on: string | null; created_at: string;
  member_count: number; task_total: number; task_done: number; task_review: number; task_revision: number;
  my_roles: string[];
}
export interface HubProjectDetail extends HubProject {
  notes: string | null; sow_doc_url: string | null; requirements_doc_url: string | null;
  track_meta: Record<string, string>; billing_day: number | null; contract_start: string | null; contract_end: string | null;
  services_included: string | null; monthly_deliverables: string | null; canManage: boolean;
  tasks: { id: string; title: string; status: string; due_on: string | null; revision_round: number }[];
  activity: { id: string; body: string | null; action: string; created_at: string; actor_name: string | null }[];
}

const COLS = "id,title,category,service_track,service,status,project_type,customer_id,starts_on,due_on,created_at,customers(name,company,customer_code)";
const DONE = new Set(["completed", "delivered", "approved"]);

function shape(p: any, members: any[], tasks: any[], me: string): HubProject {
  const mine = members.find((m) => m.project_id === p.id && m.user_id === me);
  const ts = tasks.filter((t) => t.project_id === p.id);
  return {
    id: p.id, title: p.title, category: p.category, service_track: p.service_track, service: p.service,
    status: p.status, project_type: p.project_type, customer_id: p.customer_id,
    customer_code: p.customers?.customer_code ?? null, client_name: p.customers ? (p.customers.company || p.customers.name) : null,
    starts_on: p.starts_on, due_on: p.due_on, created_at: p.created_at,
    member_count: members.filter((m) => m.project_id === p.id).length,
    task_total: ts.length, task_done: ts.filter((t) => DONE.has(t.status)).length,
    task_review: ts.filter((t) => t.status === "review").length,
    task_revision: ts.filter((t) => t.status === "revision_requested").length,
    my_roles: mine?.roles ?? [],
  };
}

export const listHubProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HubProject[]> => {
    const sb = context.supabase as any;
    const { data: ps, error } = await sb.from("client_projects").select(COLS).is("archived_at", null)
      .order("created_at", { ascending: false }).limit(1000);
    if (error) throw dbError(error);
    const ids = (ps ?? []).map((p: any) => p.id);
    if (!ids.length) return [];
    const [{ data: ms }, { data: ts }] = await Promise.all([
      sb.from("project_members").select("project_id,user_id,roles").eq("active", true).in("project_id", ids),
      sb.from("client_tasks").select("project_id,status").is("archived_at", null).in("project_id", ids).limit(5000),
    ]);
    return (ps ?? []).map((p: any) => shape(p, ms ?? [], ts ?? [], context.userId));
  });

export const getHubProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<HubProjectDetail> => {
    const sb = context.supabase as any;
    const { data: p, error } = await sb.from("client_projects")
      .select(`${COLS},notes,sow_doc_url,requirements_doc_url,track_meta,billing_day,contract_start,contract_end,services_included,monthly_deliverables,archived_at`)
      .eq("id", data.id).maybeSingle();
    if (error) throw dbError(error);
    if (!p || p.archived_at) throw new Error("Project not found");
    const [{ data: ms }, { data: ts }, { data: act }, { data: can }] = await Promise.all([
      sb.from("project_members").select("project_id,user_id,roles").eq("active", true).eq("project_id", p.id),
      sb.from("client_tasks").select("id,project_id,title,status,due_on,revision_round").is("archived_at", null).eq("project_id", p.id).order("created_at"),
      sb.from("client_project_activity").select("id,body,action,created_at,actor_id").eq("project_id", p.id).order("created_at", { ascending: false }).limit(50),
      sb.rpc("can_manage_project", { _project_id: p.id, _user: context.userId }),
    ]);
    const actorIds = [...new Set((act ?? []).map((a: any) => a.actor_id).filter(Boolean))];
    const { data: profs } = actorIds.length ? await sb.from("profiles").select("user_id,full_name").in("user_id", actorIds) : { data: [] };
    const nm = new Map<string, string>((profs ?? []).map((x: any) => [x.user_id, x.full_name]));
    return {
      ...shape(p, ms ?? [], ts ?? [], context.userId),
      notes: p.notes, sow_doc_url: p.sow_doc_url, requirements_doc_url: p.requirements_doc_url,
      track_meta: (p.track_meta ?? {}) as Record<string, string>, billing_day: p.billing_day,
      contract_start: p.contract_start, contract_end: p.contract_end,
      services_included: p.services_included, monthly_deliverables: p.monthly_deliverables,
      canManage: !!can,
      tasks: (ts ?? []).map((t: any) => ({ id: t.id, title: t.title, status: t.status, due_on: t.due_on, revision_round: t.revision_round })),
      activity: (act ?? []).map((a: any) => ({ id: a.id, body: a.body, action: a.action, created_at: a.created_at, actor_name: a.actor_id ? nm.get(a.actor_id) ?? null : null })),
    };
  });

const url = z.string().trim().url().max(1000).nullable().optional().or(z.literal("").transform(() => null));
const TrackEnum = z.enum(["web_dev", "ai_video", "ai_automation", "social_media", "other"]);
const MetaInput = z.record(z.string().max(40), z.string().trim().max(1000)).optional();

export const createHubProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    title: z.string().trim().min(2).max(160),
    category: z.enum(["client", "internal"]),
    customer_id: z.string().uuid().nullable().optional(),
    service_track: TrackEnum,
    project_type: z.enum(["one_time", "monthly"]).default("one_time"),
    status: z.enum(["planned", "active", "on_hold", "completed", "cancelled"]).default("planned"),
    starts_on: z.string().nullable().optional(),
    due_on: z.string().nullable().optional(),
    billing_day: z.number().int().min(1).max(31).nullable().optional(),
    monthly_deliverables: z.string().trim().max(2000).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    sow_doc_url: url, requirements_doc_url: url,
  }).refine((v) => v.category === "internal" || !!v.customer_id, "Choose a client for a client project").parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const label = SERVICE_TRACKS.find((t) => t.key === data.service_track)?.label ?? null;
    const { data: row, error } = await sb.from("client_projects").insert({
      ...data, customer_id: data.category === "internal" ? null : data.customer_id,
      service: label, created_by: context.userId,
    }).select("id").single();
    if (error) throw dbError(error);
    await sb.from("project_members").insert({ project_id: row.id, user_id: context.userId, roles: ["project_head"], added_by: context.userId });
    await sb.from("client_project_activity").insert({
      project_id: row.id, customer_id: data.category === "internal" ? null : data.customer_id,
      actor_id: context.userId, action: "created", body: `Project "${data.title}" created`,
    });
    return { id: row.id as string };
  });

export const updateHubProjectDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    service_track: TrackEnum.optional(),
    status: z.enum(["planned", "active", "on_hold", "completed", "cancelled"]).optional(),
    due_on: z.string().nullable().optional(),
    sow_doc_url: url, requirements_doc_url: url,
    track_meta: MetaInput,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: can } = await sb.rpc("can_manage_project", { _project_id: data.id, _user: context.userId });
    if (!can) throw new Error("Only project leadership or admins can edit this project");
    const { data: before, error: e0 } = await sb.from("client_projects").select("title,customer_id,status").eq("id", data.id).single();
    if (e0) throw dbError(e0);
    const { id, ...patch } = data;
    const upd: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) upd[k] = v;
    if (upd.track_meta) {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(upd.track_meta as Record<string, string>)) if (v) clean[k] = v;
      upd.track_meta = clean;
    }
    if (upd.service_track) upd.service = SERVICE_TRACKS.find((t) => t.key === upd.service_track)?.label ?? null;
    const { error } = await sb.from("client_projects").update(upd).eq("id", id);
    if (error) throw dbError(error);
    const body = upd.status && upd.status !== before.status ? `"${before.title}" status → ${upd.status}` : `"${before.title}" details updated`;
    await sb.from("client_project_activity").insert({ project_id: id, customer_id: before.customer_id, actor_id: context.userId, action: upd.status ? "status" : "updated", body });
    return { ok: true };
  });

export const listCustomersForPicker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as any).from("customers").select("id,name,company,customer_code")
      .is("archived_at", null).order("name").limit(1000);
    return (data ?? []) as { id: string; name: string; company: string | null; customer_code: string }[];
  });

// ---------- Handover dossier (Phase 4) ----------
export const HANDOVER_LINKS = [
  { key: "live_url", label: "Live / production link" },
  { key: "assets_url", label: "Final assets drive" },
  { key: "source_url", label: "Source code / project files" },
  { key: "guide_url", label: "User guide / SOP" },
  { key: "final_doc_url", label: "Final submission / handover doc" },
  { key: "credentials_ref", label: "Credentials reference (vault / doc link — never paste passwords)" },
] as const;
export interface HandoverItem { id: string; label: string; done: boolean }
export interface Handover {
  checklist: HandoverItem[]; links: Record<string, string>; notes: string | null;
  handed_over_at: string | null; handed_over_by_name: string | null;
}
const DEFAULT_CHECKLIST = [
  "All Scope of Work items delivered", "Internal QC passed on every task", "Client approved final delivery",
  "Final files / source handed to client", "Access & credentials transferred",
];

export const getHandover = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<Handover> => {
    const sb = context.supabase as any;
    const { data: p, error } = await sb.from("client_projects").select("handover,handed_over_at,handed_over_by").eq("id", data.id).single();
    if (error) throw dbError(error);
    const h = (p.handover ?? {}) as any;
    let by: string | null = null;
    if (p.handed_over_by) {
      const { data: pr } = await sb.from("profiles").select("full_name").eq("user_id", p.handed_over_by).maybeSingle();
      by = pr?.full_name ?? null;
    }
    return {
      checklist: Array.isArray(h.checklist) && h.checklist.length ? h.checklist
        : DEFAULT_CHECKLIST.map((label, i) => ({ id: `d${i}`, label, done: false })),
      links: h.links ?? {}, notes: h.notes ?? null, handed_over_at: p.handed_over_at, handed_over_by_name: by,
    };
  });

const HandoverInput = z.object({
  id: z.string().uuid(),
  checklist: z.array(z.object({ id: z.string().max(40), label: z.string().trim().min(1).max(200), done: z.boolean() })).max(40),
  links: z.record(z.string().max(40), z.string().trim().max(1000)),
  notes: z.string().trim().max(4000).nullable(),
  complete: z.boolean().default(false),
});

export const saveHandover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => HandoverInput.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: can } = await sb.rpc("can_manage_project", { _project_id: data.id, _user: context.userId });
    if (!can) throw new Error("Only project leadership or admins can edit the handover");
    for (const [k, v] of Object.entries(data.links)) {
      if (v && !/^https?:\/\/\S+\.\S+/i.test(v)) throw new Error(`"${HANDOVER_LINKS.find((l) => l.key === k)?.label ?? k}" must be a link starting with https://`);
    }
    const { data: before, error: e0 } = await sb.from("client_projects").select("title,customer_id,handed_over_at").eq("id", data.id).single();
    if (e0) throw dbError(e0);
    if (data.complete && data.checklist.some((c) => !c.done)) throw new Error("Tick every checklist item before handing over");
    const links: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.links)) if (v) links[k] = v;
    const upd: Record<string, unknown> = { handover: { checklist: data.checklist, links, notes: data.notes } };
    const completing = data.complete && !before.handed_over_at;
    if (completing) Object.assign(upd, { handed_over_at: new Date().toISOString(), handed_over_by: context.userId, status: "completed" });
    const { data: saved, error } = await sb.from("client_projects").update(upd).eq("id", data.id).select("id");
    if (error) throw dbError(error);
    if (!saved?.length) throw new Error("You don't have permission to update this project");
    await sb.from("client_project_activity").insert({
      project_id: data.id, customer_id: before.customer_id, actor_id: context.userId,
      action: completing ? "handover" : "updated", body: completing ? `"${before.title}" handed over to client` : `"${before.title}" handover dossier updated`,
    });
    if (completing) {
      try {
        const { projectRecipients } = await import("@/lib/project-recipients.server");
        const team = await projectRecipients(data.id, ["project_head", "team_lead", "qc_checker", "specialist"], [context.userId]);
        const { data: ts } = await sb.from("client_tasks").select("id").eq("project_id", data.id);
        const ids = (ts ?? []).map((t: any) => t.id);
        const { data: as } = ids.length ? await sb.from("client_task_assignees").select("user_id").in("task_id", ids) : { data: [] };
        const all = [...new Set<string>([...team, ...(as ?? []).map((a: any) => a.user_id)])].filter((u) => u !== context.userId);
        if (all.length) {
          const { notify } = await import("@/lib/notify.server");
          await notify({ event: "project.handover", recipients: all, actorId: context.userId, vars: { project: before.title }, dedupeKey: `proj:${data.id}:handover` });
        }
      } catch (e) { console.warn("[handover] notify failed", e); }
    }
    return { ok: true, handedOver: completing };
  });
