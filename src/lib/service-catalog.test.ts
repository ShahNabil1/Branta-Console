import { describe, expect, it } from "vitest";
import { catalogOf, mergeCatalog, parseBulk } from "./service-catalog";

describe("service catalog", () => {
  it("parses categories and numbered services in bulk", () => {
    const c = parseBulk("Video ads:\n1. Commercial, 30s\n2. AI UGC Ads\nWeb:\n- Landing page");
    expect(c).toEqual([
      { category: "Video ads", services: ["Commercial, 30s", "AI UGC Ads"] },
      { category: "Web", services: ["Landing page"] },
    ]);
  });
  it("merges without duplicates", () => {
    const m = mergeCatalog([{ category: "Video ads", services: ["AI UGC Ads"] }], [{ category: "video ads", services: ["ai ugc ads", "Product Film"] }]);
    expect(m).toEqual([{ category: "Video ads", services: ["AI UGC Ads", "Product Film"] }]);
  });
  it("falls back to the legacy flat list", () => {
    expect(catalogOf({ services: ["SEO"] })).toEqual([{ category: "Services", services: ["SEO"] }]);
  });
});
