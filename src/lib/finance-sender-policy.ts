/** Invoice/reminder sender: Resend strictly when connected (with its finance overrides), else Brevo's verified sender. */
export type FinanceRow = {
  provider: string; sender_name: string; sender_email: string; is_default: boolean;
  finance_sender_email?: string | null; finance_sender_name?: string | null;
};

export function pickFinanceSender<T extends FinanceRow>(rows: T[]): { row: T; fromName: string; fromEmail: string } | null {
  const resend = rows.find((r) => r.provider === "resend");
  if (resend) return { row: resend, fromName: resend.finance_sender_name || resend.sender_name, fromEmail: resend.finance_sender_email || resend.sender_email };
  const brevo = rows.find((r) => r.provider === "brevo");
  if (brevo) return { row: brevo, fromName: brevo.sender_name, fromEmail: brevo.sender_email };
  return null;
}
