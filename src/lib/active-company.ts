import { useEffect, useState } from "react";

// Client-side preference only: which company workspace the user is viewing.
// Access is still enforced server-side by RLS on every read.
const KEY = "branta.activeCompany";
const EVT = "branta:active-company";

export function getActiveCompanySlug(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setActiveCompanySlug(slug: string) {
  localStorage.setItem(KEY, slug);
  window.dispatchEvent(new Event(EVT));
}

export function useActiveCompanySlug() {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setSlug(getActiveCompanySlug());
    read();
    window.addEventListener(EVT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return slug;
}

/** Deterministic colorful accent per company, from the status palette tokens. */
const ACCENTS = [
  "var(--color-brand)",
  "var(--color-status-new)",
  "var(--color-status-viewed)",
  "var(--color-status-converted)",
  "var(--color-status-contacted)",
  "var(--color-channel-email)",
];
export function companyAccent(slug: string) {
  if (slug === "admakai") return "var(--company-admakai-accent)";
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}
export function companyInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("");
}
