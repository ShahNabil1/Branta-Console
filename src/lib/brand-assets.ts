// Every Console icon/logo lives in Cloudflare R2 (assets/<folder>/<file>), never in the repo.
// Add new artwork by uploading to R2 first, then registering its key here (see AGENTS.md).
export const ASSET_CDN_BASE = "https://console-cdn.brantatech.com/assets";
export const cdnAssetUrl = (key: string) => `${ASSET_CDN_BASE}/${key}`;
const asset = (key: string) => ({ url: cdnAssetUrl(key) }) as const;

export const APPS_ADMAKAI_WORDMARK = asset("apps/admakai-wordmark.png");
export const APPS_ADMAKAI = asset("apps/admakai.png");
export const APPS_TRACKER = asset("apps/tracker.png");
export const BRAND_LOGO = asset("brand-logo.png");
export const BRANTA_ICON = asset("branta-icon.svg");
export const COMPANIES_ADMAKAI_MARK = asset("companies/admakai-mark.png");
export const COMPANIES_ADMAKAI_WORDMARK_INVERSE = asset("companies/admakai-wordmark-inverse.png");
export const COMPANIES_ADMAKAI_WORDMARK = asset("companies/admakai-wordmark.png");
export const COMPANIES_BRANTA_ICON = asset("companies/branta-icon.png");
export const COMPANY_CONNECTION_VERIFIED = asset("company/connection-verified.png");
export const COMPANY_NO_CONNECTION = asset("company/no-connection.png");
export const EMAIL_BREVO_ICON = asset("email/brevo-icon.png");
export const EMAIL_BREVO_WORDMARK = asset("email/brevo-wordmark.png");
export const EMAIL_BREVO = asset("email/brevo.webp");
export const EMAIL_GOOGLE_WORDMARK = asset("email/google-wordmark.png");
export const EMAIL_RESEND_MARK_WHITE = asset("email/resend-mark-white.png");
export const EMAIL_RESEND_WORDMARK_BLACK = asset("email/resend-wordmark-black.png");
export const EMAIL_RESEND_WORDMARK_WHITE = asset("email/resend-wordmark-white.png");
export const EMAIL_RESEND = asset("email/resend.webp");
export const INTEGRATIONS_CLOUDFLARE_EMAIL_ROUTING_MARK = asset("integrations/cloudflare-email-routing-mark.png");
export const INTEGRATIONS_CLOUDFLARE_EMAIL_ROUTING = asset("integrations/cloudflare-email-routing.png");
export const INTEGRATIONS_CLOUDFLARE_ICON = asset("integrations/cloudflare-icon.png");
export const INTEGRATIONS_CLOUDFLARE_WORDMARK = asset("integrations/cloudflare-wordmark.png");
export const INTEGRATIONS_EMAIL_ROUTING_RULE_ENVELOPE = asset("integrations/email-routing-rule-envelope.png");
export const INTEGRATIONS_SWITCH_ACCOUNT = asset("integrations/switch-account.png");
export const INTEGRATIONS_WEBHOOK_FIX_STILL = asset("integrations/webhook-fix-still.png");
export const INTEGRATIONS_WEBHOOK_FIX = asset("integrations/webhook-fix.gif");
