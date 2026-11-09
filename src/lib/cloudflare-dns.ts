// Pure Cloudflare DNS record rules shared by the drawer and server functions.
import { z } from "zod";

export const RecordIn = z.object({
  type: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,12}$/),
  name: z.string().trim().min(1).max(255),
  content: z.string().max(4096).optional().default(""),
  ttl: z.number().int().min(1).max(86400).default(1),
  proxied: z.boolean().default(false),
  priority: z.number().int().min(0).max(65535).nullable().optional(),
  comment: z.string().trim().max(100).nullable().optional(),
  data: z.record(z.string(), z.unknown()).nullable().optional(),
});
const PROXIABLE = new Set(["A", "AAAA", "CNAME"]);
const DATA_TYPES = new Set(["SRV", "CAA", "CERT", "DNSKEY", "DS", "LOC", "NAPTR", "SMIMEA", "SSHFP", "TLSA", "URI", "HTTPS", "SVCB"]);

/** TXT values go to Cloudflare wrapped in double quotes (as its dashboard expects); already-quoted values stay as they are. */
export function quoteTxt(v: string) {
  const t = v.trim();
  if (!t) return t;
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t;
  return `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Builds the exact Cloudflare payload for create/update. */
export function dnsPayload(r: z.infer<typeof RecordIn>) {
  const p: Record<string, unknown> = { type: r.type, name: r.name, ttl: r.ttl };
  let content = r.content.trim();
  if (r.type === "TXT") content = quoteTxt(content);
  if (DATA_TYPES.has(r.type) && r.data && Object.keys(r.data).length) p.data = r.data;
  else p.content = content;
  if (PROXIABLE.has(r.type)) p.proxied = r.proxied; else p.proxied = false;
  if ((r.type === "MX" || r.type === "URI") && r.priority != null) p.priority = r.priority;
  if (r.comment) p.comment = r.comment;
  if (p.proxied) p.ttl = 1;
  return p;
}
export type RecordInput = z.input<typeof RecordIn>;
export const isProxiable = (t: string) => PROXIABLE.has(t);
