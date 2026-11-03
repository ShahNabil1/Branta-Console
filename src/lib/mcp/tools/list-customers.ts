import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { dbError } from "@/lib/db-errors";
import { resolveLeadCompany } from "@/lib/lead-company.server";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_customers",
  title: "List company customers",
  description: "Read a permitted company's active customer directory, respecting customer access and ownership without contact or finance fields.",
  inputSchema: {
    company_slug: z.string().regex(/^[a-z0-9-]{1,80}$/).describe("Company workspace slug."),
    limit: z.number().int().min(1).max(100).default(50).describe("Maximum customers to return, from 1 to 100."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ company_slug, limit }, ctx) => {
    const sb = await supabaseForUser(ctx);
    const userId = ctx.getUserId() ?? "";
    const co = await resolveLeadCompany(sb, userId, company_slug);
    const [{ data: access, error: accessError }, { data: viewAll, error: viewError }] = await Promise.all([
      sb.rpc("has_permission", { _user_id: userId, _perm: "customer_access" }),
      sb.rpc("has_permission", { _user_id: userId, _perm: "customer_view_all" }),
    ]);
    if (accessError || viewError || !access) throw new ToolError("Customer access is required.");
    let query = sb.from("customers").select("id,customer_code,name,company,service")
      .eq("company_id", co.id).is("archived_at", null).order("created_at", { ascending: false }).limit(limit);
    if (!viewAll) query = query.or(`owner_id.eq.${userId},created_by.eq.${userId}`);
    const { data, error } = await query;
    if (error) throw dbError(error);
    const customers = (data ?? []).map((r) => ({ id: r.id, code: r.customer_code, name: r.name, company: r.company, service: r.service }));
    return { content: [{ type: "text", text: JSON.stringify({ company: co.slug, customers }) }], structuredContent: { company: co.slug, customers } };
  },
});