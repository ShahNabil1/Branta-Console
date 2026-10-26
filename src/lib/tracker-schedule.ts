// Shared, browser-safe Shift schedule shape. Days use JS getDay(): 0 = Sunday.
import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
export const shiftSlotSchema = z
  .object({ start: hhmm, end: hhmm })
  .refine((s) => s.start < s.end, "Shift end must be after start");
export const shiftScheduleSchema = z.object({
  days: z.record(z.enum(["0", "1", "2", "3", "4", "5", "6"]), z.array(shiftSlotSchema).max(4)),
  break_minutes: z.number().int().min(0).max(240),
  grace_minutes: z.number().int().min(0).max(60),
});
export type ShiftSchedule = z.infer<typeof shiftScheduleSchema>;
export const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const DEFAULT_SCHEDULE: ShiftSchedule = {
  days: Object.fromEntries(
    ["0", "1", "2", "3", "4", "5", "6"].map((d) => [
      d,
      d === "5" ? [] : [{ start: "15:00", end: "18:00" }, { start: "21:00", end: "23:00" }],
    ]),
  ) as ShiftSchedule["days"],
  break_minutes: 30,
  grace_minutes: 0,
};
