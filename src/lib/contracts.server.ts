// Server-only contract helpers: tokens, snapshots, A4 PDF, signing emails.
import { BANGLA_QR_ASPECT, BANGLA_QR_PNG_B64 } from "@/lib/brand/bangla-qr.server";

export interface ContractSnapshot {
  title: string;
  version: number;
  company: { id: string | null; name: string; address: string | null; email: string | null; phone: string | null; website: string | null };
  client: { name: string; company: string; email: string; phone: string };
  project: { id: string; name: string };
  body: string;
  invoice: { slug: string; total: number; currency: string; due_date: string | null } | null;
  ceo: { name: string; title: string; signature_png: string | null };
  published_at: string;
}
export interface SignedPart { name: string; title: string | null; email: string; signed_at: string; ip: string | null; signature_png: string | null }

// One group bank account (same as invoices).
export const PAYMENT_ROWS: Array<[string, string]> = [
  ["Bank Name", "Standard Islami Bank PLC"], ["Account Name", "Branta Tech"], ["Account Number", "03433001126"],
  ["Branch", "Bogra Branch"], ["Routing Number", "210100374"], ["SWIFT Code", "SDBLBDDH"],
];

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function randomToken(bytes = 32): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

// Standard PDF fonts only cover Latin-1; replace what they can't draw.
const clean = (s: string) => s.replace(/৳/g, "BDT ").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
const dataUrlBytes = (u: string | null) => {
  if (!u) return null;
  const m = /^data:image\/png;base64,(.+)$/.exec(u);
  return m ? Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)) : null;
};

export async function renderContractPdf(s: ContractSnapshot, signed: SignedPart | null, hash?: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(clean(`${s.title} v${s.version}`));
  pdf.setCreationDate(new Date(s.published_at));
  pdf.setModificationDate(new Date(s.published_at));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 56, inner = W - M * 2;
  const brand = rgb(0.898, 0.416, 0.09), ink = rgb(0.09, 0.09, 0.11), muted = rgb(0.44, 0.44, 0.48), hair = rgb(0.9, 0.9, 0.92);
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const header = () => {
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: brand });
    page.drawText(clean(s.company.name), { x: M, y: H - 40, size: 15, font: bold, color: ink });
    const contact = [s.company.address, s.company.email, s.company.phone, s.company.website].filter(Boolean).join("  ·  ");
    if (contact) page.drawText(clean(contact).slice(0, 120), { x: M, y: H - 54, size: 8, font, color: muted });
    page.drawLine({ start: { x: M, y: H - 64 }, end: { x: W - M, y: H - 64 }, thickness: 0.5, color: hair });
    y = H - 88;
  };
  const ensure = (h: number) => { if (y - h < M + 30) { page = pdf.addPage([W, H]); header(); } };
  const wrap = (text: string, f = font, size = 10.5) => {
    const out: string[] = [];
    for (const para of clean(text).split("\n")) {
      if (!para.trim()) { out.push(""); continue; }
      let line = "";
      for (const word of para.split(/\s+/)) {
        const t = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(t, size) > inner && line) { out.push(line); line = word; } else line = t;
      }
      out.push(line);
    }
    return out;
  };
  const para = (text: string, f = font, size = 10.5, color = ink) => {
    for (const l of wrap(text, f, size)) { ensure(size + 5); if (l) page.drawText(l, { x: M, y, size, font: f, color }); y -= size + 5; }
  };
  header();
  page.drawText(clean(s.title.toUpperCase()), { x: M, y, size: 17, font: bold, color: ink }); y -= 18;
  page.drawText(clean(`Version ${s.version} · Published ${new Date(s.published_at).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}`), { x: M, y, size: 8.5, font, color: muted }); y -= 24;
  // Body: lines in ALL CAPS or "1. TITLE" become headings.
  for (const block of s.body.split("\n")) {
    const isHead = /^\s*(\d+\.\s+)?[A-Z][A-Z &/-]{2,}$/.test(block);
    if (isHead) { y -= 4; ensure(20); para(block, bold, 11); } else para(block);
  }
  // Payment details
  y -= 12; ensure(160);
  page.drawText("PAYMENT DETAILS", { x: M, y, size: 11, font: bold, color: ink }); y -= 16;
  if (s.invoice) para(`Invoice ${s.invoice.slug} · Amount ${s.invoice.currency} ${s.invoice.total.toLocaleString("en-US")}${s.invoice.due_date ? ` · Due ${s.invoice.due_date}` : ""}. Please mention the invoice number as the payment reference.`, font, 9.5, muted);
  else para("Invoice to be issued. Payment details below apply once the invoice is shared.", font, 9.5, muted);
  y -= 4;
  const top = y;
  for (const [k, v] of PAYMENT_ROWS) { page.drawText(k, { x: M, y, size: 9, font, color: muted }); page.drawText(v, { x: M + 110, y, size: 9, font: bold, color: ink }); y -= 14; }
  if (!s.invoice || s.invoice.currency === "BDT") {
    const qr = await pdf.embedPng(Uint8Array.from(atob(BANGLA_QR_PNG_B64), (c) => c.charCodeAt(0)));
    const qw = 78, qh = qw * BANGLA_QR_ASPECT;
    page.drawImage(qr, { x: W - M - qw, y: top - qh + 10, width: qw, height: qh });
    y = Math.min(y, top - qh);
  }
  // Signatures
  y -= 20; ensure(150);
  const colW = inner / 2 - 10;
  const sigBlock = async (x: number, label: string, name: string, title: string | null, png: string | null, date: string | null) => {
    page.drawText(label, { x, y, size: 8.5, font: bold, color: muted });
    const bytes = dataUrlBytes(png);
    if (bytes) {
      const img = await pdf.embedPng(bytes);
      const h = 46, w = Math.min(colW, (img.width / img.height) * h);
      page.drawImage(img, { x, y: y - 56, width: w, height: h });
    }
    page.drawLine({ start: { x, y: y - 62 }, end: { x: x + colW, y: y - 62 }, thickness: 0.6, color: ink });
    page.drawText(clean(name || "—"), { x, y: y - 76, size: 10, font: bold, color: ink });
    if (title) page.drawText(clean(title), { x, y: y - 89, size: 9, font, color: muted });
    if (date) page.drawText(clean(date), { x, y: y - 101, size: 8, font, color: muted });
  };
  await sigBlock(M, `FOR ${s.company.name.toUpperCase()}`, s.ceo.name, s.ceo.title, s.ceo.signature_png, null);
  await sigBlock(M + colW + 20, "FOR THE CLIENT", signed?.name ?? s.client.name, signed?.title ?? null, signed?.signature_png ?? null,
    signed ? `Signed ${new Date(signed.signed_at).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" })}` : null);
  y -= 115;
  if (signed) {
    ensure(70);
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.4, color: hair }); y -= 14;
    para(`Electronic signature record: signed by ${signed.name} <${signed.email}> after email code verification on ${new Date(signed.signed_at).toISOString()} from IP ${signed.ip ?? "unknown"}.${hash ? ` Content fingerprint (SHA-256): ${hash}` : ""}`, font, 7.5, muted);
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(`${i + 1} / ${pages.length}`, { x: W - M - 20, y: 28, size: 8, font, color: muted }));
  return pdf.save({ useObjectStreams: false });
}

/** Sends one contract email from the company's verified sender, else Branta's Resend. */
export async function sendContractEmail(companyId: string | null, to: string, subject: string, html: string) {
  const m = await import("@/lib/company-email.server");
  const own = companyId ? await m.resolveCompanySender(companyId) : null;
  if (own) {
    const r = own.provider === "brevo"
      ? await m.brevo(own.apiKey, "/smtp/email", { method: "POST", body: { sender: { name: own.fromName, email: own.fromEmail }, to: [{ email: to }], subject, htmlContent: html } })
      : await m.resend(own.apiKey, "/emails", { method: "POST", body: { from: `${own.fromName} <${own.fromEmail}>`, to: [to], subject, html } });
    if (!r.ok) throw new Error(`Email could not be sent [${r.status}]: ${JSON.stringify(r.body).slice(0, 200)}`);
    return;
  }
  const { callGateway } = await import("@/lib/connector-gateway.server");
  await callGateway({ connector: "resend", path: "/emails", method: "POST", body: { from: "Branta Tech <hello@brantatech.com>", to: [to], subject, html } });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
export function emailShell(company: string, heading: string, body: string, cta?: { href: string; label: string }) {
  return `<div style="background:#fff;font-family:Arial,sans-serif;padding:24px;color:#18181b"><div style="max-width:520px;margin:auto"><div style="font-weight:700;font-size:16px;margin-bottom:16px">${esc(company)}</div><h2 style="font-size:20px;margin:0 0 12px">${esc(heading)}</h2><p style="font-size:14px;line-height:1.6;color:#3f3f46">${body}</p>${cta ? `<p><a href="${cta.href}" style="display:inline-block;background:#E56A17;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${esc(cta.label)}</a></p>` : ""}</div></div>`;
}
export { esc };
