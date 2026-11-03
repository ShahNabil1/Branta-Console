// Browser-safe brand kit rules shared by the Settings UI and server validation.
import { z } from "zod";

export const HEX = /^#[0-9a-f]{6}$/i;
const DATA_IMG = /^data:image\/(png|webp|jpeg|svg\+xml);base64,[a-z0-9+/=]+$/i;
export const MAX_ASSET_CHARS = 400_000; // ~300 KB image after downscale

const asset = z.string().max(MAX_ASSET_CHARS).regex(DATA_IMG, "Invalid image").nullable().optional();
const hex = z.string().regex(HEX, "Use a #RRGGBB colour");

export const BrandKitSchema = z.object({
  logo_primary: asset,
  logo_inverse: asset,
  mark: asset,
  primary: hex.optional(),
  secondary: hex.optional(),
  gradient: z.object({ enabled: z.boolean(), from: hex, to: hex, angle: z.number().int().min(0).max(360) }).optional(),
}).strict();
export type BrandKit = z.infer<typeof BrandKitSchema>;

export const PREFIX_KINDS = ["lead", "customer", "invoice", "expense"] as const;
export type PrefixKind = (typeof PREFIX_KINDS)[number];
export const DEFAULT_PREFIX: Record<PrefixKind, string> = { lead: "BTL-", customer: "BTC-", invoice: "BT-", expense: "EXP-" };
export const PREFIX_RE = /^[A-Z]{2,5}-$/;
export const PrefixesSchema = z.object(
  Object.fromEntries(PREFIX_KINDS.map((k) => [k, z.string().regex(PREFIX_RE, "2–5 capital letters followed by -").optional()])) as Record<PrefixKind, z.ZodOptional<z.ZodString>>,
).strict();
export type Prefixes = Partial<Record<PrefixKind, string>>;

/** Prefixes another company already uses for the same kind (empty = no conflict). */
export function prefixConflicts(mine: Prefixes, others: { name: string; prefixes: Prefixes }[], holdingDefaults = true): string[] {
  const out: string[] = [];
  for (const k of PREFIX_KINDS) {
    const p = mine[k];
    if (!p) continue;
    for (const o of others) {
      const theirs = o.prefixes[k] || (holdingDefaults ? undefined : undefined);
      if (theirs === p) out.push(`${k} prefix ${p} is already used by ${o.name}`);
    }
  }
  return out;
}

function lum(hexColor: string) {
  const n = parseInt(hexColor.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** WCAG contrast ratio, 1–21. */
export function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}
export type Check = { level: "ok" | "warn" | "fail"; label: string; detail: string };
/** Print & screen checks for invoices on white paper. */
export function brandChecks(k: BrandKit): Check[] {
  const out: Check[] = [];
  const grade = (r: number, label: string, use: string): Check =>
    r >= 4.5 ? { level: "ok", label, detail: `${r}:1 — safe for ${use}` }
      : r >= 3 ? { level: "warn", label, detail: `${r}:1 — only for large headings, not body text` }
        : { level: "fail", label, detail: `${r}:1 — too light on white paper` };
  if (k.primary) {
    out.push(grade(contrast(k.primary, "#FFFFFF"), "Primary on white paper", "text and table headers"));
    out.push(grade(contrast(k.primary, "#FFFFFF") >= 4.5 ? 4.5 : contrast("#FFFFFF", k.primary), "White text on primary", "buttons and header bands"));
  }
  if (k.secondary) out.push(grade(contrast(k.secondary, "#FFFFFF"), "Secondary on white paper", "body text and borders"));
  if (k.gradient?.enabled) {
    const r = Math.min(contrast(k.gradient.from, "#FFFFFF"), contrast(k.gradient.to, "#FFFFFF"));
    out.push(r >= 3 ? { level: "ok", label: "Gradient print", detail: "Both stops print visibly" }
      : { level: "warn", label: "Gradient print", detail: "A stop is very light — prints may look washed out; invoices use the primary colour instead" });
  }
  out.push(k.logo_primary ? { level: "ok", label: "Primary logo", detail: "Used on invoice header" } : { level: "fail", label: "Primary logo", detail: "Missing — invoices fall back to the company name" });
  out.push(k.logo_inverse ? { level: "ok", label: "Inverse logo", detail: "Used on dark footers" } : { level: "warn", label: "Inverse logo", detail: "Upload a white version for dark backgrounds" });
  out.push(k.mark ? { level: "ok", label: "Square mark", detail: "Used as icon and favicon" } : { level: "warn", label: "Square mark", detail: "Upload a 1:1 icon for the company switcher" });
  return out;
}
