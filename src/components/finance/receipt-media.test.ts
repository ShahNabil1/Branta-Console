import { it, expect } from "vitest";
import { storedReceipts } from "./receipt-media";

it("keeps every receipt and identifies PDF among multiple attachments", () => {
  const receipts = storedReceipts({ receipt_url: "a.jpg", attachments: [{ path: "a.jpg", caption: "Receipt" }, { path: "b.pdf", caption: "Bank slip", mime_type: "application/pdf" }, { path: "c.heic", caption: "Payment screenshot" }] });
  expect(receipts.map(r => r.path)).toEqual(["a.jpg", "b.pdf", "c.heic"]);
  expect(receipts[1].isPdf).toBe(true);
});
it("preserves a legacy single receipt with no attachment rows", () => {
  expect(storedReceipts({ receipt_url: "legacy.png" }).map(r => r.path)).toEqual(["legacy.png"]);
});
it("does not duplicate the legacy receipt and excludes sealed copies", () => {
  expect(storedReceipts({ receipt_url: "a.jpg", attachments: [{ path: "a.jpg", caption: "Receipt", kind: "receipt" }, { path: "sealed.pdf", caption: null, kind: "signed_voucher" }] }).map(r => r.path)).toEqual(["a.jpg"]);
});