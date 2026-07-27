// Google Calendar meeting scheduler for leads.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const BD_TIMEZONE = "Asia/Dhaka";

export type RsvpStatus = "needsAction" | "accepted" | "declined" | "tentative";

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
  reminder_minutes: number;
  attendee_responses: Record<string, RsvpStatus>;
  rsvp_synced_at: string | null;
}

const gmailOnly = z
  .string()
  .trim()
  .email()
  .refine((v) => /^[^\s@]+@gmail\.com$/i.test(v), {
    message: "Only @gmail.com addresses are allowed",
  });

const ReminderMinutes = z
  .number()
  .int()
  .min(0)
  .max(40320) // Google's max = 4 weeks
  .default(30);

const ScheduleInput = z.object({
  leadId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  attendees: z.array(gmailOnly).min(1).max(50),
  reminderMinutes: ReminderMinutes,
});

interface GCalAttendee {
  email?: string;
  responseStatus?: RsvpStatus;
}
interface GCalEvent {
  id: string;
  hangoutLink?: string;
  htmlLink?: string;
  attendees?: GCalAttendee[];
  conferenceData?: { entryPoints?: { uri?: string; entryPointType?: string }[] };
}

function reminderOverrides(minutes: number) {
  if (minutes <= 0) return { useDefault: false, overrides: [] };
  return {
    useDefault: false,
    overrides: [
      { method: "popup", minutes },
      { method: "email", minutes },
    ],
  };
}

function extractResponses(ev: GCalEvent): Record<string, RsvpStatus> {
  const out: Record<string, RsvpStatus> = {};
  for (const a of ev.attendees ?? []) {
    if (a.email) out[a.email.toLowerCase()] = a.responseStatus ?? "needsAction";
  }
  return out;
}

export const scheduleLeadMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ScheduleInput.parse(d))
  .handler(async ({ data, context }): Promise<LeadMeetingRow> => {
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
        start: { dateTime: data.startsAt, timeZone: BD_TIMEZONE },
        end: { dateTime: data.endsAt, timeZone: BD_TIMEZONE },
        attendees: uniqAttendees.map((email) => ({ email })),
        reminders: reminderOverrides(data.reminderMinutes),
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

    const responses = extractResponses(ev);

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
        reminder_minutes: data.reminderMinutes,
        attendee_responses: responses,
        rsvp_synced_at: new Date().toISOString(),
      } as never)
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
      body: `Scheduled: ${data.title} · ${data.startsAt} (BDT)`,
      meta: {
        event_id: ev.id,
        meet_link: meetLink,
        reminder_minutes: data.reminderMinutes,
      },
    });
    try {
      const { notify } = await import("@/lib/notify.server");
      const { data: leadRow } = await context.supabase
        .from("leads").select("owner_id, slug, lead_code, name")
        .eq("id", data.leadId).maybeSingle();
      const ownerId = (leadRow as { owner_id?: string | null } | null)?.owner_id ?? null;
      const recipients = new Set<string>();
      if (ownerId && ownerId !== context.userId) recipients.add(ownerId);
      const when = `${data.startsAt} → ${data.endsAt} (BDT)`;
      await notify({
        event: "meeting.scheduled",
        recipients: Array.from(recipients),
        vars: { title: data.title, when, link: meetLink ?? "" },
        dedupeKey: `meeting:${ev.id}:scheduled`,
        actorId: context.userId,
      });
    } catch (e) {
      console.error("[scheduleLeadMeeting] notify failed:", e);
    }
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
  reminderMinutes: ReminderMinutes.optional(),
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

    const newReminder =
      typeof data.reminderMinutes === "number"
        ? data.reminderMinutes
        : ((mtg as { reminder_minutes?: number }).reminder_minutes ?? 30);

    if (mtg.google_event_id) {
      const { callGateway } = await import("@/lib/connector-gateway.server");
      await callGateway({
        connector: "google_calendar",
        path: `/calendar/v3/calendars/primary/events/${mtg.google_event_id}`,
        method: "PATCH",
        query: { sendUpdates: "all" },
        body: {
          start: { dateTime: data.startsAt, timeZone: BD_TIMEZONE },
          end: { dateTime: data.endsAt, timeZone: BD_TIMEZONE },
          reminders: reminderOverrides(newReminder),
        },
      });
    }

    const { data: row, error } = await context.supabase
      .from("lead_meetings")
      .update({
        starts_at: data.startsAt,
        ends_at: data.endsAt,
        reminder_minutes: newReminder,
      } as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("lead_activities").insert({
      lead_id: mtg.lead_id,
      actor_id: context.userId,
      kind: "meeting",
      body: `Rescheduled: ${mtg.title} · ${data.startsAt} (BDT)`,
      meta: { event_id: mtg.google_event_id, reminder_minutes: newReminder },
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
          timeZone: BD_TIMEZONE,
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

// Pull the latest attendee responseStatus from Google Calendar
// and mirror it into lead_meetings.attendee_responses so the UI shows live RSVPs.
export const syncMeetingRsvp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: z.string().uuid() }).parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ updated: number; syncedAt: string }> => {
      const { data: rows, error } = await context.supabase
        .from("lead_meetings")
        .select("id, google_event_id, attendee_responses, status")
        .eq("lead_id", data.leadId)
        .neq("status", "cancelled");
      if (error) throw new Error(error.message);
      const targets = (rows ?? []).filter(
        (r): r is typeof r & { google_event_id: string } =>
          !!r.google_event_id,
      );
      if (targets.length === 0)
        return { updated: 0, syncedAt: new Date().toISOString() };

      const { callGateway } = await import("@/lib/connector-gateway.server");
      const now = new Date().toISOString();
      let updated = 0;

      await Promise.all(
        targets.map(async (r) => {
          try {
            const ev = await callGateway<GCalEvent>({
              connector: "google_calendar",
              path: `/calendar/v3/calendars/primary/events/${r.google_event_id}`,
              method: "GET",
            });
            const next = extractResponses(ev);
            const prev = (r as { attendee_responses?: Record<string, RsvpStatus> })
              .attendee_responses ?? {};
            const changed =
              JSON.stringify(next) !== JSON.stringify(prev);
            await context.supabase
              .from("lead_meetings")
              .update({
                attendee_responses: next,
                rsvp_synced_at: now,
              } as never)
              .eq("id", r.id);
            if (changed) updated += 1;
          } catch (e) {
            console.warn("[calendar] rsvp sync failed:", r.id, e);
          }
        }),
      );

      return { updated, syncedAt: now };
    },
  );

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
    const list = (rows ?? []) as unknown as LeadMeetingRow[];

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
