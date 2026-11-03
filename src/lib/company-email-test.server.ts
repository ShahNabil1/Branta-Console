import { z } from "zod";
import { testCorrelation, safeEventDetails } from "./company-email-test-policy";

/** Called only after the existing provider receiver has authenticated the webhook. */
export async function recordCompanyTestEvent(provider: "resend" | "brevo", slug: string | null, payload: Record<string, unknown>, eventKey: string, occurredAt: string) {
  const testId = testCorrelation(payload.tags ?? payload.tag);
  if (!testId || !slug) return;
  const parsed = z.object({ event: z.string().min(1).max(100) }).safeParse({ event: payload.event ?? payload.type });
  if (!parsed.success) throw new Error("Invalid test event");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: company, error: companyError } = await supabaseAdmin.from("companies").select("id").eq("slug", slug).maybeSingle();
  if (companyError) throw companyError;
  if (!company) return;
  const { data: test, error } = await supabaseAdmin.from("company_email_tests").select("id,recipient,message_id").eq("id", testId).eq("company_id", company.id).eq("provider", provider).maybeSingle();
  if (error) throw error;
  if (!test) return;
  const messageId = payload.email_id ?? payload["message-id"] ?? payload.message_id;
  if (test.message_id && messageId !== test.message_id) return;
  const recipients = payload.to ?? payload.email ?? payload.recipient;
  if (recipients && !(Array.isArray(recipients) ? recipients : [recipients]).some((r) => typeof r === "string" && r.toLowerCase() === test.recipient.toLowerCase())) return;
  const { error: insertError } = await supabaseAdmin.from("company_email_test_events").upsert({
    test_id: test.id, event_key: eventKey.slice(0, 500), event: parsed.data.event,
    occurred_at: Number.isNaN(Date.parse(occurredAt)) ? new Date().toISOString() : occurredAt,
    details: safeEventDetails(payload) as never,
  }, { onConflict: "test_id,event_key", ignoreDuplicates: true });
  if (insertError) throw insertError;
}