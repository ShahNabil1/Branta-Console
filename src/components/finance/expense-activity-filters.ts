export type ActivityGroup = "all" | "changes" | "documents" | "sharing";
export type ActivityPreset = "today" | "yesterday" | "last7" | "last30" | "month" | "all" | "custom";
export type ActivityRange = { from: string; to: string };

export function dhakaDay(instant: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
}
function shift(day: string, offset: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
export function activityRange(preset: ActivityPreset, firstDay: string, today: string, custom?: ActivityRange): ActivityRange {
  let from = firstDay, to = today;
  if (preset === "today") from = today;
  if (preset === "yesterday") from = to = shift(today, -1);
  if (preset === "last7") from = shift(today, -6);
  if (preset === "last30") from = shift(today, -29);
  if (preset === "month") from = `${today.slice(0, 7)}-01`;
  if (preset === "custom" && custom) ({ from, to } = custom);
  from = from < firstDay ? firstDay : from > today ? today : from;
  to = to > today ? today : to < firstDay ? firstDay : to;
  return { from, to: to < from ? from : to };
}
export function activityPresets(firstDay: string, today: string): { id: ActivityPreset; label: string }[] {
  const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${firstDay}T12:00:00Z`)) / 86400000);
  return [
    { id: "today" as const, label: "Today" },
    ...(days >= 1 ? [{ id: "yesterday" as const, label: "Yesterday" }] : []),
    ...(days >= 6 ? [{ id: "last7" as const, label: "Last 7 days" }] : []),
    ...(days >= 29 ? [{ id: "last30" as const, label: "Last 30 days" }] : []),
    ...(firstDay <= `${today.slice(0, 7)}-01` && days > 0 ? [{ id: "month" as const, label: "This month" }] : []),
    { id: "all" as const, label: "All time" }, { id: "custom" as const, label: "Custom range" },
  ];
}
export function activityGroup(action: string): Exclude<ActivityGroup, "all"> {
  if (action.startsWith("share_")) return "sharing";
  if (/^(voucher_|receipt_|sealed_)/.test(action)) return "documents";
  return "changes";
}
export function matchesActivity(log: { created_at: string; actor_id: string | null; action: string }, range: ActivityRange, actor: string, group: ActivityGroup) {
  const day = dhakaDay(log.created_at);
  return day >= range.from && day <= range.to && (!actor || log.actor_id === actor) && (group === "all" || activityGroup(log.action) === group);
}