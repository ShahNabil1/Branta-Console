// Company service catalog: categories with ordered services inside.
export type ServiceCategory = { category: string; services: string[] };

const norm = (s: string) => s.trim().toLowerCase();

/** The company's catalog; falls back to the legacy flat `services` list. */
export function catalogOf(c: { service_catalog?: ServiceCategory[] | null; services?: string[] | null } | null | undefined): ServiceCategory[] {
  const cat = (c?.service_catalog ?? []).filter((g) => g && g.category);
  if (cat.length) return cat;
  const flat = (c?.services ?? []).filter(Boolean);
  return flat.length ? [{ category: "Services", services: flat }] : [];
}

export const flattenCatalog = (cat: ServiceCategory[]) => [...new Set(cat.flatMap((g) => g.services))];

/** Category that owns a service label, if any. */
export const categoryOf = (cat: ServiceCategory[], service: string) =>
  cat.find((g) => g.services.some((s) => norm(s) === norm(service)))?.category ?? null;

/**
 * Bulk text → catalog. A line ending with ":" starts a category; other lines are
 * services (leading "1." / "-" / "•" removed). Services before any category go to `fallback`.
 */
export function parseBulk(text: string, fallback = "General"): ServiceCategory[] {
  const out: ServiceCategory[] = [];
  let cur: ServiceCategory | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.endsWith(":")) {
      const name = line.slice(0, -1).replace(/^(category\s*[-:]\s*)/i, "").trim();
      if (!name) continue;
      cur = out.find((g) => norm(g.category) === norm(name)) ?? null;
      if (!cur) { cur = { category: name, services: [] }; out.push(cur); }
      continue;
    }
    const svc = line.replace(/^(\d+[.)]\s*|[-•*]\s*)/, "").trim();
    if (!svc) continue;
    if (!cur) { cur = out.find((g) => norm(g.category) === norm(fallback)) ?? null; if (!cur) { cur = { category: fallback, services: [] }; out.push(cur); } }
    if (!cur.services.some((s) => norm(s) === norm(svc))) cur.services.push(svc);
  }
  return out;
}

/** Merge `add` into `base` without duplicates (case-insensitive). */
export function mergeCatalog(base: ServiceCategory[], add: ServiceCategory[]): ServiceCategory[] {
  const out = base.map((g) => ({ ...g, services: [...g.services] }));
  for (const g of add) {
    let t = out.find((x) => norm(x.category) === norm(g.category));
    if (!t) { t = { category: g.category, services: [] }; out.push(t); }
    for (const s of g.services) if (!t.services.some((x) => norm(x) === norm(s))) t.services.push(s);
  }
  return out;
}
