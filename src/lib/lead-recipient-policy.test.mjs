import { test } from "node:test";
import assert from "node:assert/strict";
import { leadRecipientEmails } from "./lead-recipient-policy.ts";

test("allows the lead alternate address without a matching contact row", () => {
  const allowed = leadRecipientEmails("alternate@gmail.com", [
    { email: "primary@gmail.com", alt_email: null },
  ]);
  assert.equal(allowed.has("alternate@gmail.com"), true);
});

test("keeps contact primary and alternate addresses allowed", () => {
  const allowed = leadRecipientEmails(null, [
    { email: "primary@gmail.com", alt_email: "contact-alt@gmail.com" },
  ]);
  assert.deepEqual([...allowed], ["primary@gmail.com", "contact-alt@gmail.com"]);
});

test("normalizes stored addresses and excludes empty addresses", () => {
  const allowed = leadRecipientEmails(" Alternate@Gmail.com ", [
    { email: "alternate@gmail.com", alt_email: "   " },
    { email: null, alt_email: null },
  ]);
  assert.deepEqual([...allowed], ["alternate@gmail.com"]);
});

test("does not allow arbitrary addresses or another lead's alternate address", () => {
  const allowed = leadRecipientEmails("alternate@gmail.com", []);
  assert.equal(allowed.has("outsider@gmail.com"), false);
  assert.equal(allowed.has("other-lead@gmail.com"), false);
});