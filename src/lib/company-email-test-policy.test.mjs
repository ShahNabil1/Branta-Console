import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
const source = ts.transpileModule(readFileSync(new URL("./company-email-test-policy.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const { deliveryProgress, chooseCompanyProvider, testCorrelation, safeEventDetails } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
test("test send starts at 0%, acceptance is 30%, webhook confirmation 60%, delivery 100%", () => {
  assert.equal(deliveryProgress(false, []).percent, 0);
  assert.equal(deliveryProgress(true, []).percent, 30);
  assert.equal(deliveryProgress(true, [{ event: "email.sent" }]).percent, 60);
  assert.equal(deliveryProgress(true, [{ event: "delivered" }]).percent, 100);
});
test("delay, timeout and bounce never fabricate 100% delivery", () => {
  assert.equal(deliveryProgress(true, [{ event: "email.delivery_delayed" }]).percent, 60);
  assert.equal(deliveryProgress(true, [{ event: "hardBounce" }]).failed, true);
  assert.equal(deliveryProgress(true, [{ event: "hardBounce" }]).delivered, false);
});
test("out-of-order sent event cannot undo confirmed delivery", () => {
  assert.equal(deliveryProgress(true, [{ event: "email.delivered" }, { event: "email.sent" }]).percent, 100);
});
test("default provider selects real outgoing mail unless explicitly overridden", () => {
  const rows = [{ provider: "resend", is_default: false }, { provider: "brevo", is_default: true }];
  assert.equal(chooseCompanyProvider(rows)?.provider, "brevo");
  assert.equal(chooseCompanyProvider(rows, "resend")?.provider, "resend");
});
test("correlation accepts both providers' tag shapes but not arbitrary tags", () => {
  const id = "d05e9b06-58a0-4fca-96f9-ae4a8f004ef6";
  assert.equal(testCorrelation({ console_test: id }), id);
  assert.equal(testCorrelation([{ name: "console_test", value: id }]), id);
  assert.equal(testCorrelation([`console_test:${id}`]), id);
  assert.equal(testCorrelation("console_test:invalid"), null);
});
test("event detail projection excludes credentials and untrusted extra fields", () => {
  assert.deepEqual(safeEventDetails({ reason: "Mailbox rejected", token: "secret", headers: { authorization: "secret" } }), { reason: "Mailbox rejected" });
});