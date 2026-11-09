import { describe, expect, it } from "vitest";
import { boardStatusFromAssignees, normalizeWorkLink } from "./company-task-rules";

describe("submission link", () => {
  it("rejects '#' instead of sending it", () => expect(normalizeWorkLink("#")).toBeNull());
  it("keeps an empty link empty", () => expect(normalizeWorkLink("  ")).toBe(""));
  it("adds https:// to a bare domain", () => expect(normalizeWorkLink("drive.google.com/x")).toBe("https://drive.google.com/x"));
  it("keeps a full http(s) link", () => expect(normalizeWorkLink("http://a.com/b")).toBe("http://a.com/b"));
  it("rejects non-web links", () => expect(normalizeWorkLink("ftp://a.com")).toBeNull());
});

describe("board column follows assignee progress", () => {
  it("one assignee starts → Doing", () => expect(boardStatusFromAssignees("todo", ["doing"])).toBe("doing"));
  it("everyone back to not started → To Do", () => expect(boardStatusFromAssignees("doing", ["todo", "todo"])).toBe("todo"));
  it("everyone submitted → In Review", () => expect(boardStatusFromAssignees("doing", ["submitted", "approved"])).toBe("in_review"));
  it("one still working keeps Doing", () => expect(boardStatusFromAssignees("in_review", ["submitted", "doing"])).toBe("doing"));
  it("Done is never moved", () => expect(boardStatusFromAssignees("done", ["doing"])).toBe("done"));
});
