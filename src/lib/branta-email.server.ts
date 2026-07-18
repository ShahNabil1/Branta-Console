// Server-only Brevo email sender for Branta Tech transactional messages.
// Sends via the Lovable connector gateway using the linked Brevo connection.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/brevo";

const BRAND_ORANGE = "#E56A17";
const BRAND_TEXT = "#0F172A";
const BRAND_MUTED = "#64748B";
const BRAND_BG = "#F9FAFB";
const BRAND_HAIRLINE = "#E5E7EB";

const escapeHtml = (v: string) =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export interface WelcomeEmailInput {
  recipientEmail: string;
  brantaId: string;
  tempPassword: string;
  loginUrl: string;
  role: string;
}

interface CredentialsEmailInput extends WelcomeEmailInput {
  headingKicker: string;
  headingTitle: string;
  intro: string;
  subInfo: string;
  ctaLabel: string;
  subject: string;
}

const renderCredentialsHtml = ({
  recipientEmail,
  brantaId,
  tempPassword,
  loginUrl,
  role,
  headingKicker,
  headingTitle,
  intro,
  subInfo,
  ctaLabel,
}: CredentialsEmailInput) => {
  const idSafe = escapeHtml(brantaId);
  const pwSafe = escapeHtml(tempPassword);
  const urlSafe = escapeHtml(loginUrl);
  const roleSafe = escapeHtml(role);
  const emailSafe = escapeHtml(recipientEmail);
  const kicker = escapeHtml(headingKicker);
  const title = escapeHtml(headingTitle);
  const introSafe = escapeHtml(intro);
  const subInfoSafe = escapeHtml(subInfo);
  const ctaSafe = escapeHtml(ctaLabel);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:${BRAND_TEXT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_BG};padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid ${BRAND_HAIRLINE};border-radius:4px;overflow:hidden;">
            <tr>
              <td style="background:#0B0B0F;padding:22px 28px;">
                <div style="font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;letter-spacing:0.16em;color:${BRAND_ORANGE};text-transform:uppercase;">${kicker}</div>
                <div style="margin-top:6px;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.01em;">${title}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 12px;font-size:14px;line-height:1.55;">${introSafe}</p>
                <p style="margin:0 0 20px;font-size:13px;color:${BRAND_MUTED};line-height:1.55;">${subInfoSafe}</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND_HAIRLINE};border-radius:4px;margin-bottom:20px;">
                  <tr>
                    <td style="padding:14px 16px;border-bottom:1px solid ${BRAND_HAIRLINE};">
                      <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_MUTED};font-weight:600;">Branta ID</div>
                      <div style="margin-top:4px;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:14px;color:${BRAND_TEXT};">${idSafe}<span style="color:${BRAND_ORANGE};font-weight:600;">@brantatech.com</span></div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;border-bottom:1px solid ${BRAND_HAIRLINE};">
                      <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_MUTED};font-weight:600;">Temporary password</div>
                      <div style="margin-top:4px;font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;letter-spacing:0.04em;color:${BRAND_TEXT};font-weight:600;">${pwSafe}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;">
                      <div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_MUTED};font-weight:600;">Role</div>
                      <div style="margin-top:4px;font-size:13px;color:${BRAND_TEXT};text-transform:capitalize;">${roleSafe.replace(/_/g, " ")}</div>
                    </td>
                  </tr>
                </table>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center">
                      <a href="${urlSafe}" style="display:inline-block;background:${BRAND_ORANGE};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:4px;font-size:13px;font-weight:600;letter-spacing:0.01em;">${ctaSafe}</a>
                    </td>
                  </tr>
                </table>

                <p style="margin:20px 0 0;font-size:12px;color:${BRAND_MUTED};line-height:1.55;">Security notes: this temporary password should be changed once you have signed in. Two-factor authentication is mandatory and will be enforced on your next login.</p>
              </td>
            </tr>
            <tr>
              <td style="background:${BRAND_BG};padding:16px 28px;border-top:1px solid ${BRAND_HAIRLINE};">
                <div style="font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND_MUTED};">Branta Tech Secure Network</div>
                <div style="margin-top:4px;font-size:11px;color:${BRAND_MUTED};line-height:1.5;">This mailbox is not monitored. Delivered to ${emailSafe}. All activity on the Console is logged and audited.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const sendBrevo = async (subject: string, html: string, to: string) => {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  if (!BREVO_KEY)
    throw new Error(
      "Brevo connector is not linked. Link the Brevo connection in project settings.",
    );

  const res = await fetch(`${GATEWAY_URL}/smtp/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": BREVO_KEY,
    },
    body: JSON.stringify({
      sender: { name: "Branta Tech", email: "noreply@brantatech.com" },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[brevo] send failed [${res.status}]: ${body}`);
    throw new Error(`Email send failed [${res.status}]: ${body}`);
  }
};

export const sendWelcomeEmail = async (input: WelcomeEmailInput): Promise<void> => {
  const html = renderCredentialsHtml({
    ...input,
    headingKicker: "Branta Tech",
    headingTitle: "Console access created",
    intro: "Welcome to Branta Tech. An operator account has been provisioned for you on the internal Console.",
    subInfo: "Use the temporary credentials below to sign in. You'll be asked to enable an authenticator app right after your first sign-in.",
    ctaLabel: "Open Branta Console",
    subject: "Welcome to Branta Tech — Console access",
  });
  await sendBrevo("Welcome to Branta Tech — Console access", html, input.recipientEmail);
};

export const sendPasswordResetEmail = async (input: WelcomeEmailInput): Promise<void> => {
  const html = renderCredentialsHtml({
    ...input,
    headingKicker: "Branta Tech",
    headingTitle: "Your password was reset",
    intro: "An administrator has reset your Branta Console password. Your previous password no longer works.",
    subInfo: "Use the temporary password below to sign in. Two-factor authentication will still be required.",
    ctaLabel: "Sign in to Console",
    subject: "Branta Tech — Your password has been reset",
  });
  await sendBrevo("Branta Tech — Your password has been reset", html, input.recipientEmail);
};
