// Server-only contract helpers: tokens, snapshots, A4 PDF, signing emails.
import { BANGLA_QR_ASPECT, BANGLA_QR_PNG_B64 } from "@/lib/brand/bangla-qr.server";

export interface ContractSnapshot {
  title: string;
  version: number;
  company: { id: string | null; name: string; address: string | null; email: string | null; phone: string | null; website: string | null; logo_url?: string | null };
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

// Standard rules printed on every contract, after the agreed terms.
export const GENERAL_TERMS: string[] = [
  "Work starts after this contract is signed and the advance payment (if any) is received.",
  "The client provides all brand assets, references and approvals on time; delays on the client's side move the delivery date accordingly.",
  "Revisions are limited to the number agreed above. Extra revisions or changes to the agreed scope are quoted and billed separately.",
  "Feedback must be shared in writing (project chat or email) within 5 working days of each delivery, otherwise the delivery is treated as approved.",
  "Final files are released after full payment. Ownership of the final approved deliverables passes to the client after full payment.",
  "The provider may show the finished work in its portfolio unless the client asks otherwise in writing.",
  "Payments already made are non-refundable for work completed. Either party may end this contract with 7 days' written notice; completed work is billed.",
  "Both parties keep each other's confidential information private during and after the project.",
  "This contract is governed by the laws of Bangladesh. Disputes are first settled by mutual discussion.",
];

async function loadLogo(s: ContractSnapshot): Promise<Uint8Array | null> {
  let url = s.company.logo_url ?? null;
  try {
    if (!url && s.company.id) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin.from("companies").select("logo_url").eq("id", s.company.id).maybeSingle();
      url = (data?.logo_url as string | null) ?? null;
    }
    if (!url) return null;
    if (url.startsWith("data:")) return dataUrlBytes(url);
    if (!/^https:\/\//.test(url)) return null;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch { return null; }
}

export async function renderContractPdf(s: ContractSnapshot, signed: SignedPart | null, hash?: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(clean(`${s.title} v${s.version}`));
  pdf.setCreationDate(new Date(s.published_at));
  pdf.setModificationDate(new Date(s.published_at));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 50, inner = W - M * 2;
  const brand = rgb(0.898, 0.416, 0.09), ink = rgb(0.09, 0.09, 0.11), muted = rgb(0.44, 0.44, 0.48), hair = rgb(0.9, 0.9, 0.92), panel = rgb(0.973, 0.973, 0.976);
  let logo: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  const lb = await loadLogo(s);
  if (lb) { try { logo = await pdf.embedPng(lb); } catch { try { logo = await pdf.embedJpg(lb); } catch { logo = null; } } }
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const header = () => {
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: brand });
    if (logo) {
      const h = 30, w = Math.min(170, (logo.width / logo.height) * h);
      page.drawImage(logo, { x: M, y: H - 58, width: w, height: h });
    } else page.drawText(clean(s.company.name), { x: M, y: H - 46, size: 16, font: bold, color: ink });
    const lines = [s.company.website, s.company.email, s.company.phone].filter(Boolean) as string[];
    lines.forEach((l, i) => { const t = clean(l); page.drawText(t, { x: W - M - font.widthOfTextAtSize(t, 8), y: H - 32 - i * 11, size: 8, font, color: muted }); });
    page.drawLine({ start: { x: M, y: H - 72 }, end: { x: W - M, y: H - 72 }, thickness: 0.5, color: hair });
    y = H - 96;
  };
  const ensure = (h: number) => { if (y - h < M + 30) { page = pdf.addPage([W, H]); header(); } };
  const wrapW = (text: string, f: typeof font, size: number, width: number) => {
    const out: string[] = [];
    for (const p of clean(text).split("\n")) {
      if (!p.trim()) { out.push(""); continue; }
      let line = "";
      for (const word of p.split(/\s+/)) {
        const t = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = word; } else line = t;
      }
      out.push(line);
    }
    return out;
  };
  const para = (text: string, f = font, size = 10, color = ink, x = M, width = inner) => {
    for (const l of wrapW(text, f, size, width)) { ensure(size + 5); if (l) page.drawText(l, { x, y, size, font: f, color }); y -= size + 5; }
  };
  const heading = (t: string) => {
    y -= 6; ensure(34);
    page.drawRectangle({ x: M, y: y - 3, width: 3, height: 13, color: brand });
    page.drawText(clean(t.toUpperCase()), { x: M + 10, y, size: 10.5, font: bold, color: ink }); y -= 18;
  };
  const kvTable = (rows: Array<[string, string]>, x: number, width: number, top: number, labelW = 82) => {
    let yy = top;
    for (const [k, v] of rows) {
      const vl = wrapW(v || "—", bold, 8.8, width - labelW - 16);
      const h = Math.max(1, vl.length) * 11 + 8;
      page.drawLine({ start: { x, y: yy - h }, end: { x: x + width, y: yy - h }, thickness: 0.4, color: hair });
      page.drawText(k, { x: x + 8, y: yy - 13, size: 8.3, font, color: muted });
      vl.forEach((l, i) => page.drawText(l, { x: x + 8 + labelW, y: yy - 13 - i * 11, size: 8.8, font: bold, color: ink }));
      yy -= h;
    }
    return top - yy;
  };
  const panelBox = (x: number, top: number, width: number, title: string, rows: Array<[string, string]>) => {
    // measure first
    const hRows = rows.reduce((a, [, v]) => a + Math.max(1, wrapW(v || "—", bold, 8.8, width - 98).length) * 11 + 8, 0);
    const h = hRows + 26;
    page.drawRectangle({ x, y: top - h, width, height: h, color: panel, borderColor: hair, borderWidth: 0.6 });
    page.drawText(title, { x: x + 8, y: top - 15, size: 8, font: bold, color: brand });
    kvTable(rows, x, width, top - 20);
    return h;
  };

  header();
  // Title block
  page.drawText(clean(s.title.toUpperCase()), { x: M, y, size: 18, font: bold, color: ink }); y -= 16;
  page.drawText(clean(`Version ${s.version}  ·  Date ${new Date(s.published_at).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Dhaka" })}  ·  Project: ${s.project.name}`), { x: M, y, size: 8.5, font, color: muted }); y -= 22;

  // Parties side by side
  heading("Parties to this agreement");
  const colW = inner / 2 - 6;
  const provider: Array<[string, string]> = [["Company", s.company.name], ["Represented by", `${s.ceo.name}${s.ceo.title ? `, ${s.ceo.title}` : ""}`], ["Address", s.company.address ?? ""], ["Email", s.company.email ?? ""], ["Phone", s.company.phone ?? ""]];
  const client: Array<[string, string]> = [["Name", s.client.name], ["Company", s.client.company], ["Email", s.client.email], ["Phone", s.client.phone], ["Project", s.project.name]];
  ensure(150);
  const h1 = panelBox(M, y, colW, "SERVICE PROVIDER", provider);
  const h2 = panelBox(M + colW + 12, y, colW, "CLIENT", client);
  y -= Math.max(h1, h2) + 16;

  // Agreed terms from the template; ALL CAPS or "1. TITLE" lines become headings.
  for (const block of s.body.split("\n")) {
    const isHead = /^\s*(\d+\.\s+)?[A-Z][A-Z &/-]{2,}$/.test(block);
    if (isHead) heading(block.replace(/^\s*\d+\.\s+/, "")); else para(block);
  }

  // General rules
  heading("General terms & conditions");
  GENERAL_TERMS.forEach((t, i) => {
    const lines = wrapW(t, font, 9.3, inner - 22);
    ensure(lines.length * 13 + 4);
    page.drawText(`${i + 1}.`, { x: M + 2, y, size: 9.3, font: bold, color: brand });
    lines.forEach((l) => { page.drawText(l, { x: M + 20, y, size: 9.3, font, color: ink }); y -= 13; });
    y -= 3;
  });

  // Payment details — always present, invoice or not.
  y -= 6; ensure(200);
  heading("Payment details");
  if (s.invoice) para(`Invoice ${s.invoice.slug}  ·  Amount ${s.invoice.currency} ${s.invoice.total.toLocaleString("en-US")}${s.invoice.due_date ? `  ·  Due ${s.invoice.due_date}` : ""}. Please use the invoice number as the payment reference.`, font, 9, muted);
  else para("The invoice will be shared separately. Please make all payments to the account below.", font, 9, muted);
  y -= 4;
  const showQr = !s.invoice || s.invoice.currency === "BDT";
  const tableW = showQr ? inner - 120 : inner;
  const top = y;
  page.drawRectangle({ x: M, y: top - PAYMENT_ROWS.length * 19, width: tableW, height: PAYMENT_ROWS.length * 19, borderColor: hair, borderWidth: 0.6, color: panel });
  const th = kvTable(PAYMENT_ROWS, M, tableW, top, 110);
  if (showQr) {
    const qr = await pdf.embedPng(Uint8Array.from(atob(BANGLA_QR_PNG_B64), (c) => c.charCodeAt(0)));
    const qw = 96, qh = qw * BANGLA_QR_ASPECT;
    page.drawImage(qr, { x: W - M - qw, y: top - qh, width: qw, height: qh });
    y = Math.min(top - th, top - qh) - 4;
  } else y = top - th;
  y -= 14;
  para("International clients: please send via SWIFT and cover all bank charges.", font, 7.8, muted);

  // Signatures (below payment details)
  y -= 18; ensure(140);
  page.drawText("SIGNED BY THE PARTIES", { x: M, y, size: 8, font: bold, color: muted }); y -= 14;
  const sigBlock = async (x: number, label: string, name: string, title: string | null, png: string | null, date: string | null) => {
    page.drawText(label, { x, y, size: 8.5, font: bold, color: brand });
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
  await sigBlock(M + colW + 12, "FOR THE CLIENT", signed?.name ?? s.client.name, signed?.title ?? null, signed?.signature_png ?? null,
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
