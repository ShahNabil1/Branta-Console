import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { dbError } from "@/lib/db-errors";
import { resolveLeadCompany } from "@/lib/lead-company.server";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_leads",
  title: "List company leads",
  description: "Read non-draft, unconverted leads for one permitted company, without contact details or financial values.",
  inputSchema: {
    company_slug: z.string().regex(/^[a-z0-9-]{1,80}$/).describe("Company workspace slug, such as branta-tech or admakai."),
    limit: z.number().int().min(1).max(100).default(50).describe("Maximum leads to return, from 1 to 100."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ company_slug, limit }, ctx) => {
    const sb = await supabaseForUser(ctx);
    const co = await resolveLeadCompany(sb, ctx.getUserId() ?? "", company_slug);
    const { data, error } = await sb.from("leads")
      .select("id,slug,lead_code,name,company,status,next_follow_up_at")
      .eq("company_id", co.id).neq("status", "converted").eq("is_draft", false)
      .order("last_activity_at", { ascending: false }).limit(limit);
    if (error) throw dbError(error);
    const leads = (data ?? []).map((r) => ({ id: r.id, code: r.slug ?? r.lead_code, name: r.name, company: r.company, status: r.status, next_follow_up_at: r.next_follow_up_at }));
    return { content: [{ type: "text", text: JSON.stringify({ company: co.slug, leads }) }], structuredContent: { company: co.slug, leads } };
  },
});