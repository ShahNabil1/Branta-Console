import { describe, expect, it } from "vitest";
import { companyIdentity } from "./company-identity";
import { COMPANIES_ADMAKAI_WORDMARK as wordmark } from "@/lib/brand-assets";
import { COMPANIES_ADMAKAI_MARK as mark } from "@/lib/brand-assets";

describe("company identity isolation", () => {
  it("uses the authentic Admakai wordmark and separate square icon", () => {
    expect(companyIdentity("admakai").logo).toBe(wordmark.url);
    expect(companyIdentity("admakai").icon).toBe(mark.url);
    expect(companyIdentity("admakai").icon).not.toBe(companyIdentity("admakai").logo);
  });
  it("gives stored updated company assets priority", () => {
    expect(companyIdentity("admakai", { logo_url: "/new-logo.png", brand_kit: { mark: "/new-icon.png" } }))
      .toMatchObject({ logo: "/new-logo.png", icon: "/new-icon.png" });
  });
  it("never lends Admakai artwork to another company", () => {
    expect(companyIdentity("deveror").logo).toBeUndefined();
    expect(companyIdentity("deveror").icon).toBeUndefined();
  });
});