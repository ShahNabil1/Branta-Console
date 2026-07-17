// Google Calendar meeting scheduler for leads.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface LeadMeetingRow {
  id: string;
  lead_id: string;
  google_event_id: string | null;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  meeting_link: string | null;
  attendees: string[];
  status: "scheduled" | "completed" | "cancelled";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const ScheduleInput = z.object({
  leadId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  attendees: z.array(z.string().email()).default([]),
});

interface GCalEvent {
  id: string;
  hangoutLink?: string;
  htmlLink?: string;
  conferenceData?: { entryPoints?: { uri?: string; entryPointType?: string }[] };
}

export const scheduleLeadMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScheduleInput.parse(d))
  .handler(async ({ data, context }): Promise<LeadMeetingRow> => {
    const { callGateway } = await import("@/lib/connector-gateway.server");
    const requestId = crypto.randomUUID();
    const ev = await callGateway<GCalEvent>({
      connector: "google_calendar",
      path: "/calendar/v3/calendars/primary/events",
      method: "POST",
      query: { conferenceDataVersion: 1, sendUpdates: "all" },
      body: {
        summary: data.title,
        description: data.description ?? "",
        start: { dateTime: data.startsAt },
        end: { dateTime: data.endsAt },
        attendees: data.attendees.map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      },
    });
    const meetLink =
      ev.hangoutLink ??
      ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")
        ?.uri ??
      ev.htmlLink ??
      null;

    const { data: row, error } = await context.supabase
      .from("lead_meetings")
      .insert({
        lead_id: data.leadId,
        google_event_id: ev.id,
        title: data.title,
        description: data.description ?? null,
        starts_at: data.startsAt,
        ends_at: data.endsAt,
        meeting_link: meetLink,
        attendees: data.attendees,
        status: "scheduled",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Bump lead to meeting status + activity log
    await context.supabase
      .from("leads")
      .update({ status: "meeting" })
      .eq("id", data.leadId);
    await context.supabase.from("lead_activities").insert({
      lead_id: data.leadId,
      actor_id: context.userId,
      kind: "meeting",
      body: `Scheduled: ${data.title} · ${new Date(data.startsAt).toLocaleString()}`,
      meta: { event_id: ev.id, meet_link: meetLink },
    });
    return row as LeadMeetingRow;
  });

export const cancelLeadMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: mtg, error: fErr } = await context.supabase
      .from("lead_meetings")
      .select("google_event_id, lead_id, title")
      .eq("id", data.id)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!mtg) throw new Error("Meeting not found");
    if (mtg.google_event_id) {
      const { callGateway } = await import("@/lib/connector-gateway.server");
      try {
        await callGateway({
          connector: "google_calendar",
          path: `/calendar/v3/calendars/primary/events/${mtg.google_event_id}`,
          method: "DELETE",
          query: { sendUpdates: "all" },
        });
      } catch (e) {
        console.warn("[calendar] delete failed:", e);
      }
    }
    await context.supabase
      .from("lead_meetings")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    await context.supabase.from("lead_activities").insert({
      lead_id: mtg.lead_id,
      actor_id: context.userId,
      kind: "meeting",
      body: `Cancelled: ${mtg.title}`,
    });
    return { ok: true };
  });

export const listLeadMeetings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { leadId: string }) =>
    z.object({ leadId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<LeadMeetingRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("lead_meetings")
      .select("*")
      .eq("lead_id", data.leadId)
      .order("starts_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as LeadMeetingRow[];
  });
