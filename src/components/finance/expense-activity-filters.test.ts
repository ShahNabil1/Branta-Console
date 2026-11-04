import { describe, it, expect } from "vitest";
import { activityRange, activityPresets, dhakaDay, matchesActivity } from "./expense-activity-filters";

describe("Expense activity dates and employees", () => {
  it("uses November 5 in Dhaka for a November 4 22:39 UTC event", () => {
    expect(dhakaDay("2026-11-04T22:39:00Z")).toBe("2026-11-05");
  });
  it("does not offer Yesterday for an expense created today, November 5", () => {
    expect(activityPresets("2026-11-05", "2026-11-05").map(p => p.id)).toEqual(["today", "all", "custom"]);
  });
  it("offers Yesterday when creation was before today", () => {
    expect(activityPresets("2026-11-04", "2026-11-05").some(p => p.id === "yesterday")).toBe(true);
  });
  it("cannot select before creation on the 5th or after today's 8th", () => {
    expect(activityRange("custom", "2026-11-05", "2026-11-08", { from: "2026-11-01", to: "2026-11-20" })).toEqual({ from: "2026-11-05", to: "2026-11-08" });
  });
  it("month and all time never include future days", () => {
    for (const preset of ["month", "all"] as const) expect(activityRange(preset, "2026-11-05", "2026-11-08")).toEqual({ from: "2026-11-05", to: "2026-11-08" });
  });
  it("shows only the selected employee's events on the selected Dhaka day", () => {
    const range = { from: "2026-11-05", to: "2026-11-05" };
    const log = { created_at: "2026-11-04T22:39:00Z", actor_id: "tanzil", action: "updated" };
    expect(matchesActivity(log, range, "tanzil", "changes")).toBe(true);
    expect(matchesActivity(log, range, "other", "changes")).toBe(false);
    expect(matchesActivity({ ...log, created_at: "2026-11-04T12:00:00Z" }, range, "tanzil", "changes")).toBe(false);
    expect(matchesActivity(log, range, "tanzil", "documents")).toBe(false);
  });
});