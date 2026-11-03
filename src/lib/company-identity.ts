import wordmark from "@/assets/companies/admakai-wordmark.png.asset.json";
import inverse from "@/assets/companies/admakai-wordmark-inverse.png.asset.json";
import mark from "@/assets/companies/admakai-mark.png.asset.json";
import brantaIcon from "@/assets/companies/branta-icon.png.asset.json";

type IdentitySource = { logo_url?: string | null; brand_kit?: { logo_primary?: string | null; logo_inverse?: string | null; mark?: string | null } | null };
const identities: Record<string, { logo?: string; inverse?: string; icon: string }> = {
  admakai: { logo: wordmark.url, inverse: inverse.url, icon: mark.url },
  // Branta keeps its original full holding logo in the switcher; only the square icon is bundled.
  "branta-tech": { icon: brantaIcon.url },
};

/** Stored company identity wins; bundled transferred assets are a loading fallback. */
export function companyIdentity(slug: string, source?: IdentitySource) {
  const fallback = identities[slug];
  return {
    logo: source?.logo_url || source?.brand_kit?.logo_primary || fallback?.logo,
    inverse: source?.brand_kit?.logo_inverse || fallback?.inverse,
    icon: source?.brand_kit?.mark || fallback?.icon || source?.logo_url,
  };
}