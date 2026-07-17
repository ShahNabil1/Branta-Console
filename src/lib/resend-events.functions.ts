// Read Resend delivery events from the Google Sheet, grouped per lead_email row.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface ResendEvent {
  timestamp: string;
  event_type: string;
  email_id: string;
  lead_email_id: string;
  recipient: string;
}

export const listResendEventsForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: z.string().uuid() }).parse(d),
  )
  .handler(
    async ({ data }): Promise<Record<string, ResendEvent[]>> => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { readAllEvents } = await import("@/lib/resend-events.server");
      let rows;
      try {
        rows = await readAllEvents(supabaseAdmin);
      } catch (e) {
        console.warn("[resend-events] read failed:", e);
        return {};
      }
      const grouped: Record<string, ResendEvent[]> = {};
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
