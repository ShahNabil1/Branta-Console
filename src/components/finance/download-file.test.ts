import { afterEach, expect, it, vi } from "vitest";
import { fetchDownloadBlob } from "./download-file";

afterEach(() => vi.unstubAllGlobals());
it("returns the complete successful file", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("receipt-data", { headers: { "Content-Type": "application/pdf" } })));
  const blob = await fetchDownloadBlob("/receipt.pdf");
  expect(await blob.text()).toBe("receipt-data");
  expect(blob.type).toBe("application/pdf");
});
it("rejects HTTP failure instead of reporting success", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 403 })));
  await expect(fetchDownloadBlob("/receipt.pdf")).rejects.toThrow("File could not be downloaded");
});
it("rejects network failure so the same download can be retried", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(new Response("retry-data")));
  await expect(fetchDownloadBlob("/receipt.pdf")).rejects.toThrow("Failed to fetch");
  expect(await (await fetchDownloadBlob("/receipt.pdf")).text()).toBe("retry-data");
});
it("does not mark an empty file successful", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("")));
  await expect(fetchDownloadBlob("/receipt.pdf")).rejects.toThrow("empty");
});