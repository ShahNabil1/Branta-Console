import { describe, expect, it } from "vitest";
import { nextGoLiveIn, taskBucket } from "./company-task-rules";
const now = Date.parse("2026-11-09T10:00:00Z");
describe("task buckets", () => {
  it("scheduled task waits until its exact time", () => {
    expect(taskBucket({ publish_state: "scheduled", scheduled_at: "2026-11-09T10:00:01Z", archived_at: null }, now)).toBe("scheduled");
  });
  it("scheduled task joins the board once its time arrives", () => {
    expect(taskBucket({ publish_state: "scheduled", scheduled_at: "2026-11-09T10:00:00Z", archived_at: null }, now)).toBe("board");
  });
  it("drafts stay off the board", () => {
    expect(taskBucket({ publish_state: "draft", scheduled_at: null, archived_at: null }, now)).toBe("draft");
  });
  it("archived wins over everything", () => {
    expect(taskBucket({ publish_state: "live", scheduled_at: null, archived_at: "2026-11-01T00:00:00Z" }, now)).toBe("archived");
  });
  it("next go-live is the soonest schedule", () => {
    expect(nextGoLiveIn([
      { publish_state: "scheduled", scheduled_at: "2026-11-09T10:05:00Z", archived_at: null },
      { publish_state: "scheduled", scheduled_at: "2026-11-09T10:01:00Z", archived_at: null },
    ], now)).toBe(60_000);
  });
});
