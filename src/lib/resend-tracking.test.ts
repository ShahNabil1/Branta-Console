import { describe, expect, it } from "vitest";
import { trackingIssues } from "./resend-tracking";

const good = { tracking_subdomain: "links", open_tracking: true, click_tracking: true, tls: "opportunistic", records: [{ status: "verified" }] };

describe("trackingIssues", () => {
  it("fully configured domain has no issues", () => expect(trackingIssues(good)).toEqual([]));
  it("flags open tracking disabled even when everything else is set", () =>
    expect(trackingIssues({ ...good, open_tracking: false })).toEqual(["open"]));
  it("flags click tracking disabled", () => expect(trackingIssues({ ...good, click_tracking: false })).toEqual(["click"]));
  it("flags enforced TLS", () => expect(trackingIssues({ ...good, tls: "enforced" })).toEqual(["tls"]));
  it("flags a missing tracking subdomain", () => expect(trackingIssues({ ...good, tracking_subdomain: null })).toContain("subdomain"));
  it("flags unverified tracking DNS", () =>
    expect(trackingIssues({ ...good, records: [{ status: "verified" }, { status: "pending" }] })).toEqual(["dns"]));
});
