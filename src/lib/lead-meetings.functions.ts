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
  created_by_name?: string | null;
}

const gmailOnly = z
  .string()
  .trim()
  .email()
  .refine((v) => /^[^\s@]+@gmail\.com$/i.test(v), {
    message: "Only @gmail.com addresses are allowed",
  });

const ScheduleInput = z.object({
  leadId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  attendees: z.array(gmailOnly).min(1).max(50),
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
    // Deduplicate attendees case-insensitively
    const uniqAttendees = Array.from(
      new Map(data.attendees.map((e) => [e.toLowerCase(), e])).values(),
    );

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
        attendees: uniqAttendees.map((email) => ({ email })),
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
        attendees: uniqAttendees,
        status: "scheduled",
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

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
      .update({ status: "cancelled", meeting_link: null })
      .eq("id", data.id);
    await context.supabase.from("lead_activities").insert({
      lead_id: mtg.lead_id,
      actor_id: context.userId,
      kind: "meeting",
      body: `Cancelled: ${mtg.title}`,
    });
    return { ok: true };
  });

const RescheduleInput = z.object({
  id: z.string().uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
});

export const rescheduleLeadMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RescheduleInput.parse(d))
  .handler(async ({ data, context }): Promise<LeadMeetingRow> => {
    if (new Date(data.endsAt) <= new Date(data.startsAt)) {
      throw new Error("End time must be after start time.");
    }
    const { data: mtg, error: fErr } = await context.supabase
      .from("lead_meetings")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!mtg) throw new Error("Meeting not found");
    if (mtg.status === "cancelled")
      throw new Error("Cannot reschedule a cancelled meeting");

    if (mtg.google_event_id) {
      const { callGateway } = await import("@/lib/connector-gateway.server");
      await callGateway({
        connector: "google_calendar",
        path: `/calendar/v3/calendars/primary/events/${mtg.google_event_id}`,
        method: "PATCH",
        query: { sendUpdates: "all" },
        body: {
          start: { dateTime: data.startsAt },
          end: { dateTime: data.endsAt },
        },
      });
    }

    const { data: row, error } = await context.supabase
      .from("lead_meetings")
      .update({ starts_at: data.startsAt, ends_at: data.endsAt })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("lead_activities").insert({
      lead_id: mtg.lead_id,
      actor_id: context.userId,
      kind: "meeting",
      body: `Rescheduled: ${mtg.title} · ${new Date(data.startsAt).toLocaleString()}`,
      meta: { event_id: mtg.google_event_id },
    });
    return row as LeadMeetingRow;
  });

export interface MeetingConflict {
  eventId: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  htmlLink: string | null;
}

export const checkMeetingConflicts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        startsAt: z.string(),
        endsAt: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<MeetingConflict[]> => {
    const { callGateway } = await import("@/lib/connector-gateway.server");
    try {
      const res = await callGateway<{
        items?: Array<{
          id: string;
          status?: string;
          summary?: string;
          htmlLink?: string;
          transparency?: string;
          start?: { dateTime?: string; date?: string };
          end?: { dateTime?: string; date?: string };
        }>;
      }>({
        connector: "google_calendar",
        path: "/calendar/v3/calendars/primary/events",
        method: "GET",
        query: {
          timeMin: data.startsAt,
          timeMax: data.endsAt,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: 20,
        },
      });
      return (res.items ?? [])
        .filter(
          (ev) =>
            ev.status !== "cancelled" &&
            ev.transparency !== "transparent" &&
            (ev.start?.dateTime || ev.start?.date),
        )
        .map((ev) => ({
          eventId: ev.id,
          summary: ev.summary ?? "(Untitled event)",
          startsAt: ev.start?.dateTime ?? ev.start?.date ?? "",
          endsAt: ev.end?.dateTime ?? ev.end?.date ?? "",
          htmlLink: ev.htmlLink ?? null,
        }));
    } catch (e) {
      console.warn("[calendar] conflict check failed:", e);
      return [];
    }
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
    const list = (rows ?? []) as LeadMeetingRow[];

    // Resolve creator names in one query
    const creatorIds = Array.from(
      new Set(list.map((m) => m.created_by).filter(Boolean) as string[]),
    );
    if (creatorIds.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", creatorIds);
      const nameById = new Map(
        (profs ?? []).map((p) => [p.user_id, p.full_name ?? null]),
      );
      for (const m of list) {
        m.created_by_name = m.created_by ? nameById.get(m.created_by) ?? null : null;
      }
    }
    return list;
  });
