// Shared social-platform metadata used by Lead + Profile social-link sections.
import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const SOCIAL_PLATFORMS = [
  "website",
  "linkedin",
  "facebook",
  "instagram",
  "youtube",
  "x",
  "tiktok",
  "whatsapp",
  "telegram",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const PLATFORM_META: Record<
  SocialPlatform,
  { name: string; color: string; svg: React.ReactNode }
> = {
  website: {
    name: "Website",
    color: "#334155",
    svg: <Globe className="size-3.5" />,
  },
  linkedin: {
    name: "LinkedIn",
    color: "#0A66C2",
    svg: (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
        <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.61 0 4.28 2.38 4.28 5.47v6.27zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45z" />
      </svg>
    ),
  },
  facebook: {
    name: "Facebook",
    color: "#1877F2",
    svg: (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
        <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5H16.7V3.6c-.28-.04-1.25-.12-2.38-.12-2.36 0-3.98 1.44-3.98 4.08V9.9H7.6V13h2.74v8h3.16z" />
      </svg>
    ),
  },
  instagram: {
    name: "Instagram",
    color: "#E4405F",
    svg: (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
        <path d="M12 2.2c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.42.56.22.96.48 1.38.9.42.42.68.82.9 1.38.17.42.37 1.06.42 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.42 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.17-1.06.37-2.23.42-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.42-.56-.22-.96-.48-1.38-.9-.42-.42-.68-.82-.9-1.38-.17-.42-.37-1.06-.42-2.23C2.21 15.58 2.2 15.2 2.2 12s.01-3.58.07-4.85c.05-1.17.25-1.8.42-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.17 1.06-.37 2.23-.42C8.42 2.21 8.8 2.2 12 2.2zm0 1.8c-3.15 0-3.5.01-4.74.07-1 .05-1.55.22-1.91.36-.48.19-.83.41-1.19.77-.36.36-.58.71-.77 1.19-.14.36-.31.91-.36 1.91-.06 1.24-.07 1.59-.07 4.74s.01 3.5.07 4.74c.05 1 .22 1.55.36 1.91.19.48.41.83.77 1.19.36.36.71.58 1.19.77.36.14.91.31 1.91.36 1.24.06 1.59.07 4.74.07s3.5-.01 4.74-.07c1-.05 1.55-.22 1.91-.36.48-.19.83-.41 1.19-.77.36-.36.58-.71.77-1.19.14-.36.31-.91.36-1.91.06-1.24.07-1.59.07-4.74s-.01-3.5-.07-4.74c-.05-1-.22-1.55-.36-1.91a3.2 3.2 0 0 0-.77-1.19 3.2 3.2 0 0 0-1.19-.77c-.36-.14-.91-.31-1.91-.36C15.5 4.01 15.15 4 12 4zm0 3.05a4.95 4.95 0 1 1 0 9.9 4.95 4.95 0 0 1 0-9.9zm0 8.16a3.21 3.21 0 1 0 0-6.42 3.21 3.21 0 0 0 0 6.42zm5.15-8.36a1.16 1.16 0 1 1 0-2.32 1.16 1.16 0 0 1 0 2.32z" />
      </svg>
    ),
  },
  youtube: {
    name: "YouTube",
    color: "#FF0000",
    svg: (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
        <path d="M23.5 7.1a3 3 0 0 0-2.1-2.12C19.55 4.5 12 4.5 12 4.5s-7.55 0-9.4.48A3 3 0 0 0 .5 7.1C0 8.95 0 12 0 12s0 3.05.5 4.9a3 3 0 0 0 2.1 2.12C4.45 19.5 12 19.5 12 19.5s7.55 0 9.4-.48a3 3 0 0 0 2.1-2.12C24 15.05 24 12 24 12s0-3.05-.5-4.9zM9.75 15.5v-7l6.25 3.5-6.25 3.5z" />
      </svg>
    ),
  },
  x: {
    name: "X (Twitter)",
    color: "#000000",
    svg: (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  tiktok: {
    name: "TikTok",
    color: "#000000",
    svg: (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
        <path d="M19.6 6.32a5.6 5.6 0 0 1-3.32-1.08 5.6 5.6 0 0 1-2.16-3.24h-3.36v13.44a2.64 2.64 0 1 1-2.64-2.64c.24 0 .48.03.72.09v-3.42a6 6 0 1 0 5.28 5.97V9.53a8.94 8.94 0 0 0 5.48 1.86V8.03c0-.63-.13-1.19-.36-1.71z" />
      </svg>
    ),
  },
  whatsapp: {
    name: "WhatsApp",
    color: "#25D366",
    svg: (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.077 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 2C6.486 2 2 6.486 2 12c0 1.995.585 3.85 1.59 5.42L2.05 22l4.72-1.53A9.949 9.949 0 0 0 12 22c5.514 0 10-4.486 10-10S17.514 2 12 2z" />
      </svg>
    ),
  },
  telegram: {
    name: "Telegram",
    color: "#26A5E4",
    svg: (
      <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
        <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
      </svg>
    ),
  },
};

export const PLATFORM_DOMAINS: Record<SocialPlatform, string[]> = {
  website: [],
  linkedin: ["linkedin.com", "lnkd.in"],
  facebook: ["facebook.com", "fb.com", "fb.me"],
  instagram: ["instagram.com", "instagr.am"],
  youtube: ["youtube.com", "youtu.be"],
  x: ["x.com", "twitter.com"],
  tiktok: ["tiktok.com"],
  whatsapp: ["wa.me", "whatsapp.com", "api.whatsapp.com", "chat.whatsapp.com"],
  telegram: ["t.me", "telegram.me", "telegram.org"],
};

export function normalizeUrl(_platform: SocialPlatform, url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Returns null when valid, else a user-facing error string. */
export function validateUrl(platform: SocialPlatform, url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return "URL is required";
  const normalized = normalizeUrl(platform, trimmed);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return "Enter a valid URL";
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return "URL must start with http:// or https://";
  }
  if (platform === "website") return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const allowed = PLATFORM_DOMAINS[platform];
  const ok = allowed.some((d) => host === d || host.endsWith(`.${d}`));
  if (!ok) {
    return `${PLATFORM_META[platform].name} link must be on ${allowed.join(" or ")}`;
  }
  return null;
}

export function PlatformIcon({ platform }: { platform: string }) {
  const meta = PLATFORM_META[platform as SocialPlatform];
  if (!meta) return <Globe className="size-3.5" />;
  return <span style={{ color: meta.color }}>{meta.svg}</span>;
}

export function PlatformSelect({
  value,
  onChange,
  className,
}: {
  value: SocialPlatform;
  onChange: (v: SocialPlatform) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SocialPlatform)}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SOCIAL_PLATFORMS.map((p) => (
          <SelectItem key={p} value={p}>
            <span className="inline-flex items-center gap-2">
              <PlatformIcon platform={p} />
              {PLATFORM_META[p].name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
