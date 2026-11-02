// Employee-profile social link rules (CRM lead links keep every platform).
import type { SocialPlatform } from "@/components/social/platforms";

export const EMPLOYEE_EXCLUDED_PLATFORMS: readonly SocialPlatform[] = ["youtube", "tiktok"];

export const SOCIAL_LABELS = [
  "Personal",
  "Office / Work",
  "Business",
  "Official / Direct",
  "Page / Channel",
  "Portfolio / Website",
  "Support / On-Call",
] as const;

export const WA_PREFIX = "https://wa.me/+88";

/** Valid 11-digit Bangladeshi mobile number (013–019). */
export const isBdMobile = (v: string) => /^01[3-9]\d{8}$/.test(v);

/** Pull an 11-digit BD number out of a stored wa.me URL. */
export function waNumberFromUrl(url: string): string {
  const digits = url.replace(/\D/g, "");
  const m = digits.match(/(01[3-9]\d{8})$/);
  return m ? m[1] : "";
}

export const waUrl = (num: string) => `${WA_PREFIX}${num}`;
