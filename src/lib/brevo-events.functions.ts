// Read Brevo delivery events from the Brevo events Google Sheet, grouped per lead_email row.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface BrevoLeadEvent {
  timestamp: string;
  event_type: string;
  email_id: string;
  lead_email_id: string;
  recipient: string;
}

export const listBrevoEventsForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: z.string().uuid() }).parse(d),
  )
  .handler(
    async ({ data }): Promise<Record<string, BrevoLeadEvent[]>> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { readAllBrevoEvents } = await import("@/lib/brevo-events.server");
      let rows;
      try {
        rows = await readAllBrevoEvents(supabaseAdmin);
      } catch (e) {
        console.warn("[brevo-events] read failed:", e);
        return {};
      }
      const grouped: Record<string, BrevoLeadEvent[]> = {};
      for (const r of rows) {
        if (r.lead_id !== data.leadId) continue;
        const key = r.lead_email_id || r.email_id;
        if (!key) continue;
        (grouped[key] ||= []).push({
          timestamp: r.timestamp,
          event_type: r.event_type,
          email_id: r.email_id,
          lead_email_id: r.lead_email_id,
          recipient: r.recipient,
        });
      }
      for (const key of Object.keys(grouped)) {
        grouped[key].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      }
      return grouped;
    },
  );
