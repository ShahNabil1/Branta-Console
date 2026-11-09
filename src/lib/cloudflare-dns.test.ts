import { describe, expect, it } from "vitest";
import { dnsPayload, quoteTxt, RecordIn } from "./cloudflare-dns";

describe("Cloudflare DNS payload", () => {
  it("wraps unquoted TXT content in double quotes", () => {
    expect(quoteTxt("v=spf1 include:_spf.mx.cloudflare.net ~all")).toBe('"v=spf1 include:_spf.mx.cloudflare.net ~all"');
  });
  it("keeps already-quoted TXT content unchanged", () => {
    expect(quoteTxt('"v=DMARC1; p=none"')).toBe('"v=DMARC1; p=none"');
  });
  it("never sends proxied for TXT/MX and sends priority for MX", () => {
    const p = dnsPayload(RecordIn.parse({ type: "MX", name: "@", content: "mx.example.com", proxied: true, priority: 10 }));
    expect(p).toMatchObject({ type: "MX", proxied: false, priority: 10, content: "mx.example.com" });
  });
  it("forces Auto TTL when an A record is proxied", () => {
    const p = dnsPayload(RecordIn.parse({ type: "A", name: "www", content: "1.2.3.4", proxied: true, ttl: 3600 }));
    expect(p).toMatchObject({ proxied: true, ttl: 1 });
  });
});
