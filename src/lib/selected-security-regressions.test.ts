import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("selected security regressions", () => {
  it("session listing cannot delete ended-session history", () => {
    const source = readFileSync(new URL("./user-sessions.functions.ts", import.meta.url), "utf8");
    const listing = source.split("export const listMySessions =")[1].split("export const revokeSession =")[0];
    expect(listing).not.toContain(".delete(");
    expect(listing.match(/\.eq\("user_id", context\.userId\)/g)).toHaveLength(2);
  });
  it("does not expose the retired arbitrary-path receipt signing action", () => {
    const files = readdirSync(new URL("./", import.meta.url)).filter((name) => name.endsWith(".functions.ts"));
    for (const file of files) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/export\s+const\s+getExpenseAttachmentUrl\b/);
    }
  });
  it("salary PDFs are not cached after revocation", () => {
    const route = readFileSync(new URL("../routes/api/public/salary.$slip[.]pdf.ts", import.meta.url), "utf8");
    expect(route).toContain('"cache-control": "private, no-store"');
  });
});