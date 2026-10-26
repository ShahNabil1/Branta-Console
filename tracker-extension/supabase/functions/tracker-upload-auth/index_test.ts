import { createHandler, signUpload } from "./index.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const origin = `chrome-extension://${"a".repeat(32)}`;
const body = { employee_id: id, timestamp: "2026-10-26T04:00:00.000Z", content_type: "image/webp" };
const env = (name: string) => ({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "test-only" }[name]);
function request(data: unknown = body, options: RequestInit = {}) {
  return new Request("https://example.invalid", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer test-jwt", Origin: origin },
    body: JSON.stringify(data), ...options,
  });
}
function harness(authStatus = 200) {
  let signed = 0;
  const handler = createHandler({ env,
    fetch: (() => Promise.resolve(Response.json({ id, role: "authenticated" }, { status: authStatus }))) as typeof fetch,
    sign: (path) => { signed++; return Promise.resolve(`https://example.invalid/${path}`); },
  });
  return { handler, signed: () => signed };
}

Deno.test("preflight works without JWT, rejects web origins and unsupported methods", async () => {
  const { handler, signed } = harness();
  const response = await handler(new Request("https://example.invalid", { method: "OPTIONS", headers: { Origin: origin } }));
  equal(response.status, 204); equal(response.headers.get("Access-Control-Allow-Origin"), origin);
  equal((await handler(request(body, { headers: { Origin: "https://evil.example" } }))).status, 403);
  equal((await handler(new Request("https://example.invalid", { method: "GET" }))).status, 405);
  equal(signed(), 0);
});
Deno.test("missing and invalid JWTs never reach signer", async () => {
  const h = harness(401);
  equal((await h.handler(request(body, { headers: { "Content-Type": "application/json" } }))).status, 401);
  equal((await h.handler(request())).status, 401); equal(h.signed(), 0);
});
Deno.test("another employee is forbidden despite valid authentication", async () => {
  const h = harness(); equal((await h.handler(request({ ...body, employee_id: otherId }))).status, 403); equal(h.signed(), 0);
});
Deno.test("input validation rejects traversal, invalid dates, wrong MIME and oversized JSON", async () => {
  const h = harness();
  for (const data of [null, [], { ...body, employee_id: "../other" }, { ...body, content_type: "image/png" },
    { ...body, timestamp: "../../secret" }, { ...body, timestamp: "2026-02-30T04:00:00.000Z" }]) {
    equal((await h.handler(request(data))).status, 400);
  }
  equal((await h.handler(request(body, { body: "{" }))).status, 400);
  equal((await h.handler(request(body, { headers: { Authorization: "Bearer test" } }))).status, 415);
  equal((await h.handler(request({ ...body, extra: "x".repeat(5000) }))).status, 413);
  equal(h.signed(), 0);
});
Deno.test("owner receives exact path, response shape, TTL and no-store", async () => {
  const h = harness(); const response = await h.handler(request());
  equal(response.status, 200);
  const path = `tracker/screenshots/${id}/2026-10-26/2026-10-26T04:00:00.000Z.webp`;
  equal(await response.json(), { upload_url: `https://example.invalid/${path}`, storage_path: path, expires_in: 900 });
  equal(response.headers.get("Cache-Control"), "no-store"); equal(h.signed(), 1);
});
Deno.test("provider failures return sanitized responses", async () => {
  const h = harness(503); equal((await h.handler(request())).status, 503); equal(h.signed(), 0);
  const handler = createHandler({ env, fetch: (()=>Promise.resolve(Response.json({ id, role: "authenticated" }))) as typeof fetch,
    sign: ()=>{ throw new Error("sensitive provider detail"); } });
  const result = await handler(request()); equal(result.status, 503);
  equal(await result.json(), { error: "Upload authorization temporarily unavailable" });
});
Deno.test("real AWS signer binds content-type, path, default bucket and 900-second expiry without network", async () => {
  const config: Record<string,string> = { R2_ACCOUNT_ID: "a".repeat(32), R2_ACCESS_KEY_ID: "test-only-access", R2_SECRET_ACCESS_KEY: "test-only-secret" };
  const path = `tracker/screenshots/${id}/2026-10-26/test.webp`;
  const result = new URL(await signUpload(path, (key)=>config[key]));
  equal(decodeURIComponent(result.pathname), `/brantaconsole/${path}`);
  equal(result.searchParams.get("X-Amz-Expires"), "900");
  equal(result.searchParams.get("X-Amz-SignedHeaders"), "content-type;host");
  equal(result.searchParams.has("x-amz-checksum-crc32"), false);
});
