// Display labels for the expense_category enum. The database keeps the
// lowercase enum values; every screen / export shows these labels instead.
export const EXPENSE_CATEGORY_KEYS = ["office", "tools", "ads", "salary", "tax", "refund", "misc"] as const;

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  office: "Office",
  tools: "Tools & Software",
  ads: "Ads & Marketing",
  salary: "Salary",
  tax: "Tax",
  refund: "Refund",
  misc: "Miscellaneous",
};

/** Human label for any category value; unknown values get Title Case. */
export function formatCategory(value: string | null | undefined): string {
  const v = (value ?? "").toString().trim();
  if (!v) return "—";
  const known = EXPENSE_CATEGORY_LABELS[v.toLowerCase()];
  if (known) return known;
  return v
    .replace(/_/g, " ")
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
