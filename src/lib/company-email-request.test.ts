import { afterEach, expect, it, vi } from "vitest";
import { resend } from "./company-email.server";

afterEach(() => vi.restoreAllMocks());

it("finishes a stalled Resend webhook response as a retryable timeout", async () => {
  const controller = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => new Response(new ReadableStream({
    start(stream) {
      init?.signal?.addEventListener("abort", () => stream.error(new DOMException("Timed out", "TimeoutError")));
    },
  }))));
  try {
    const request = resend("fixture-only-key", "/webhooks");
    await new Promise(resolve => setTimeout(resolve, 10));
    controller.abort(new DOMException("Timed out", "TimeoutError"));
    await expect(request).resolves.toMatchObject({ ok: false, status: 0, body: { message: "The provider check timed out. Please retry." } });
  } finally { vi.unstubAllGlobals(); }
}, 1000);