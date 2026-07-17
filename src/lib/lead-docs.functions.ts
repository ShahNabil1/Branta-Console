// Google Docs generation for leads (proposal / contract / NDA).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface LeadDocumentRow {
  id: string;
  lead_id: string;
  doc_id: string;
  doc_url: string;
  title: string;
  template_kind: "proposal" | "contract" | "nda" | "custom";
  created_by: string | null;
  created_at: string;
}

type TemplateKind = "proposal" | "contract" | "nda";

interface LeadCtx {
  name: string;
  company: string | null;
  email: string | null;
  value_usd: number | null;
  currency: "BDT" | "USD";
}

function templateContent(kind: TemplateKind, lead: LeadCtx): string {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const client = lead.company || lead.name;
  const value = lead.value_usd
    ? `$${lead.value_usd.toLocaleString("en-US")}`
    : "[TBD]";

  if (kind === "proposal") {
    return `BRANTA TECH — PROPOSAL
Prepared for: ${client}
Contact: ${lead.name}${lead.email ? ` (${lead.email})` : ""}
Date: ${today}

1. Executive Summary
Branta Tech is pleased to submit this proposal to ${client}. This document outlines the scope of engagement, deliverables, timeline, and investment.

2. Scope of Work
[Describe engagement scope here]

3. Deliverables
• Deliverable 1
• Deliverable 2
• Deliverable 3

4. Timeline
Kick-off within 2 weeks of signed agreement. Estimated duration: [TBD].

5. Investment
Total engagement value: ${value}

6. Next Steps
Please review and let us know if you'd like to schedule a follow-up.

— Branta Tech`;
  }

  if (kind === "contract") {
    return `SERVICES AGREEMENT
Between: Branta Tech ("Provider")
And: ${client} ("Client")
Effective Date: ${today}

1. Services
Provider shall deliver the services described in the attached proposal.

2. Fees
Total fee: ${value}, payable per the schedule agreed by both parties.

3. Term & Termination
Either party may terminate with 30 days written notice.

4. Confidentiality
Both parties will keep confidential information confidential.

5. Governing Law
This agreement is governed by the laws applicable to Branta Tech's principal office.

Signatures:
Branta Tech: _______________________  Date: __________
${client}: _______________________  Date: __________`;
  }

  return `MUTUAL NON-DISCLOSURE AGREEMENT
Between Branta Tech and ${client}
Effective: ${today}

1. Purpose
Each party may share confidential information for the purpose of evaluating a potential business relationship.

2. Definition
"Confidential Information" means any non-public information disclosed by one party to the other.

3. Obligations
The receiving party will use the information only for the stated Purpose and protect it with reasonable care.

4. Term
This NDA remains in effect for 2 years from the Effective Date.

Signatures:
Branta Tech: _______________________
${client}: _______________________`;
}

const GenInput = z.object({
  leadId: z.string().uuid(),
  templateKind: z.enum(["proposal", "contract", "nda"]),
  title: z.string().trim().max(200).optional(),
});

export const generateLeadDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GenInput.parse(d))
  .handler(async ({ data, context }): Promise<LeadDocumentRow> => {
    const { data: lead, error: lErr } = await context.supabase
      .from("leads")
      .select("name, company, value_usd, lead_code, slug")
      .eq("id", data.leadId)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    if (!lead) throw new Error("Lead not found");

    const { data: primary } = await context.supabase
      .from("lead_contacts")
      .select("email")
      .eq("lead_id", data.leadId)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle();

    const leadCtx: LeadCtx = {
      name: lead.name,
      company: lead.company,
      email: primary?.email ?? null,
      value_usd: lead.value_usd,
    };

    const title =
      data.title?.trim() ||
      `${data.templateKind[0].toUpperCase() + data.templateKind.slice(1)} — ${lead.company || lead.name} (${lead.slug ?? lead.lead_code})`;
    const body = templateContent(data.templateKind, leadCtx);

    const { callGateway } = await import("@/lib/connector-gateway.server");
    const created = await callGateway<{ documentId: string }>({
      connector: "google_docs",
      path: "/v1/documents",
      method: "POST",
      body: { title },
    });
    await callGateway({
      connector: "google_docs",
      path: `/v1/documents/${created.documentId}:batchUpdate`,
      method: "POST",
      body: {
        requests: [
          { insertText: { location: { index: 1 }, text: body } },
        ],
      },
    });

    const url = `https://docs.google.com/document/d/${created.documentId}/edit`;
    const { data: row, error } = await context.supabase
      .from("lead_documents")
      .insert({
        lead_id: data.leadId,
        doc_id: created.documentId,
        doc_url: url,
        title,
        template_kind: data.templateKind,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("lead_activities").insert({
      lead_id: data.leadId,
      actor_id: context.userId,
      kind: "note",
      body: `Generated ${data.templateKind}: ${title}`,
      meta: { doc_id: created.documentId, doc_url: url },
    });
    return row as LeadDocumentRow;
  });

export const listLeadDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) =>
    z.object({ leadId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<LeadDocumentRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("lead_documents")
      .select("*")
      .eq("lead_id", data.leadId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as LeadDocumentRow[];
  });

export const deleteLeadDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("lead_documents")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
