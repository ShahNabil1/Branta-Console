import { describe, expect, it } from "vitest";
import { pickFinanceSender } from "./finance-sender-policy";

const resend = { provider: "resend", sender_name: "Admakai", sender_email: "hello@admakai.com", is_default: false, finance_sender_email: "finance@admakai.com", finance_sender_name: "Admakai Finance" };
const brevo = { provider: "brevo", sender_name: "Admakai Team", sender_email: "team@admakai.com", is_default: true, finance_sender_email: "x@admakai.com", finance_sender_name: "X" };

describe("pickFinanceSender", () => {
  it("uses Resend's finance name and email even when Brevo is the default", () => {
    expect(pickFinanceSender([brevo, resend])).toMatchObject({ fromName: "Admakai Finance", fromEmail: "finance@admakai.com" });
  });
  it("falls back to Resend's default sender when no finance override is set", () => {
    const r = pickFinanceSender([{ ...resend, finance_sender_email: null, finance_sender_name: null }]);
    expect(r).toMatchObject({ fromName: "Admakai", fromEmail: "hello@admakai.com" });
  });
  it("uses Brevo's verified sender only when Resend is not connected", () => {
    expect(pickFinanceSender([brevo])).toMatchObject({ fromName: "Admakai Team", fromEmail: "team@admakai.com" });
  });
  it("returns null when neither is connected", () => {
    expect(pickFinanceSender([])).toBeNull();
  });
});
