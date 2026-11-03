import { describe, expect, it } from "vitest";
import { contrast, prefixConflicts, PrefixesSchema } from "./brand-kit";

describe("brand kit", () => {
  it("white on white is 1:1, black on white 21:1", () => {
    expect(contrast("#FFFFFF", "#FFFFFF")).toBe(1);
    expect(contrast("#000000", "#FFFFFF")).toBe(21);
  });
  it("a sister cannot reuse Branta's default lead prefix", () => {
    expect(prefixConflicts({ lead: "BTL-" }, [{ name: "Branta Tech", isHolding: true, prefixes: {} }])).toHaveLength(1);
    expect(prefixConflicts({ lead: "ADL-" }, [{ name: "Branta Tech", isHolding: true, prefixes: {} }])).toHaveLength(0);
  });
  it("prefix must be 2-5 capitals and a dash", () => {
    expect(PrefixesSchema.safeParse({ lead: "ADL-" }).success).toBe(true);
    expect(PrefixesSchema.safeParse({ lead: "adl" }).success).toBe(false);
  });
});
