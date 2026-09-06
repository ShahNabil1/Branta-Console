// Server-only: renders a branded, paginated A4 invoice PDF using pdf-lib.
// Never import from client code.
//
// Page geometry (fixed, per company letterhead):
//   A4 595.28 x 841.89 pt
//   Top margin    1.80 in = 129.6 pt   (reserved for printed letterhead header)
//   Bottom margin 0.80 in =  57.6 pt   (reserved for printed letterhead footer)
// In "digital" mode the reserved bands are filled with the Branta Tech
// letterhead artwork. In "print" mode they are left completely blank so the
// content never overlaps pre-printed letterhead paper.

import type { PDFDocument, PDFFont, PDFImage, PDFPage, RGB } from "pdf-lib";
import { embedBrandLogo, generatedByLine, type GeneratedBy } from "@/lib/brand/pdf-brand.server";

export type { GeneratedBy };

/** Header band: brand logo only, plus the orange rule. No marketing copy. */
function drawBrandHeader(p: PDFPage, logo: PDFImage | null, brand: RGB) {
  const bandH = 92;
  const bandY = PAGE_H - bandH;
  p.drawRectangle({ x: 0, y: bandY - 6, width: PAGE_W, height: 4, color: brand });
  if (logo) {
    const h = 46;
    const w = (logo.width / logo.height) * h;
    p.drawImage(logo, { x: SIDE, y: bandY + (bandH - h) / 2, width: w, height: h });
  }
}

/** Footer band: white logo + contact strip, then the provenance line. */
function drawBrandFooter(
  p: PDFPage,
  opts: {
    logo: PDFImage | null;
    font: PDFFont;
    brand: RGB;
    white: RGB;
    muted: RGB;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    generatedBy?: GeneratedBy | null;
  },
) {
  const fH = 20;
  p.drawRectangle({ x: 0, y: 24, width: PAGE_W, height: fH, color: opts.brand });

  let left = SIDE;
  if (opts.logo) {
    const h = 11;
    const w = (opts.logo.width / opts.logo.height) * h;
    p.drawImage(opts.logo, { x: SIDE, y: 24 + (fH - h) / 2, width: w, height: h });
    left = SIDE + w + 14;
  }

  const segs = [
    opts.phone ? `Phone: ${opts.phone}` : null,
    opts.email ? `Email: ${opts.email}` : null,
    opts.website ? `Web: ${opts.website.replace(/^https?:\/\//, "")}` : null,
  ].filter(Boolean) as string[];
  const area = PAGE_W - SIDE - left;
  const segW = area / Math.max(1, segs.length);
  segs.forEach((t, i) => {
    const txt = safeText(t);
    const w = opts.font.widthOfTextAtSize(txt, 8);
    p.drawText(txt, { x: left + i * segW + (segW - w) / 2, y: 30, size: 8, font: opts.font, color: opts.white });
  });

  const line = safeText(generatedByLine(opts.generatedBy));
  const lw = opts.font.widthOfTextAtSize(line, 7);
  p.drawText(line, { x: (PAGE_W - lw) / 2, y: 12, size: 7, font: opts.font, color: opts.muted });
}

export interface InvoiceLineItem {
  sequence: number;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface InvoicePdfData {
  invoice: {
    slug: string;
    title: string;
    description: string | null;
    currency: string;
    total_amount: number;
    paid_amount: number;
    status: string;
    project_type: string;
    starts_on: string | null;
    ends_on: string | null;
    due_date?: string | null;
    discount_amount?: number | null;
    tax_percent?: number | null;
    terms?: string | null;
    notes: string | null;
    created_at: string;
  };
  customer: {
    name: string | null;
    customer_code: string | null;
    email: string | null;
    company: string | null;
    phone: string | null;
    address?: string | null;
  };
  installments: Array<{
    sequence: number;
    label: string;
    due_date: string;
    amount: number;
    status: string;
    paid_at: string | null;
  }>;
  lineItems?: InvoiceLineItem[];
  settings: PdfSettings;
}

export interface PdfSettings {
  company_name: string;
  company_tagline: string | null;
  company_address: string | null;
  company_email: string | null;
  company_website: string | null;
  company_phone?: string | null;
  logo_url: string | null;
  brand_color: string;
  header_bg_color: string;
  page_bg_color: string;
  panel_bg_color: string;
  text_color: string;
  muted_color: string;
  hairline_color: string;
  header_text: string;
  footer_text: string;
  signature_name: string | null;
  signature_title: string | null;
  payment_info?: string | null;
  payment_note?: string | null;
  sections: {
    description?: boolean;
    installments?: boolean;
    stakeholders?: boolean;
    notes?: boolean;
    footer?: boolean;
    payment_info?: boolean;
    terms?: boolean;
  };
}

export const DEFAULT_PAYMENT_INFO = `Account Name: Branta Tech
Bank Name: Standard Islami Bank PLC.
Branch Name: Bogura
Account Number: 03433001126
Routing Number: 210100374
SWIFT Code: SDBLBDDH
Bank Address: Helal Mansion, Sherpur Road, Sutrapur, Bogura
Branch Code: 00034
Payment Reference: Please mention the Invoice Number when making the payment.
Bkash: +8801933228681 (Send Money)
Nagad: +8801749781779 (Send Money)`;

export const DEFAULT_PAYMENT_NOTE =
  "All applicable bank charges and transaction fees must be borne by the client. The payment will be considered confirmed after the amount has been successfully credited to our account.";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const TOP_MARGIN = 129.6; // 1.80 inch
const BOTTOM_MARGIN = 57.6; // 0.80 inch
const SIDE = 48;

function hex(rgbFn: (r: number, g: number, b: number) => RGB, h: string): RGB {
  const s = (h || "#000000").replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(full || "000000", 16);
  return rgbFn(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function money(n: number, cur: string): string {
  return `${cur} ` + Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeText(s: string | null | undefined): string {
  const v = (s ?? "").toString();
  return v
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2022]/g, "*")
    .replace(/[\u00B7]/g, "-")
    .replace(/[^\x20-\x7E\n]/g, "?");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return safeText(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/* ---------------- amount in words ---------------- */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function threeDigits(n: number): string {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} Hundred`); n %= 100; }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "")); }
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
}

function intToWords(n: number): string {
  if (n === 0) return "Zero";
  const units: Array<[number, string]> = [
    [1_000_000_000, "Billion"],
    [1_000_000, "Million"],
    [1_000, "Thousand"],
  ];
  let rest = n;
  const out: string[] = [];
  for (const [value, label] of units) {
    if (rest >= value) {
      out.push(`${threeDigits(Math.floor(rest / value))} ${label}`);
      rest %= value;
    }
  }
  if (rest > 0) out.push(threeDigits(rest));
  return out.join(" ").replace(/\s+/g, " ").trim();
}

export function amountInWords(amount: number, currency: string): string {
  const cur = (currency || "BDT").toUpperCase();
  const major = cur === "BDT" ? "Taka" : cur === "USD" ? "US Dollar" : cur;
  const minor = cur === "BDT" ? "Poisha" : cur === "USD" ? "Cent" : "";
  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);
  let s = `${major} ${intToWords(whole)}`;
  if (cents > 0) s += ` and ${intToWords(cents)}${minor ? ` ${minor}` : ""}`;
  return `${s} Only`;
}

async function tryFetchImage(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/* ---------------- renderer ---------------- */

/** Colour logo for the header (custom URL wins), white logo for the footer. */
async function loadBrandLogos(
  pdf: PDFDocument,
  s: PdfSettings,
  mode: "digital" | "print",
): Promise<{ logo: PDFImage | null; whiteLogo: PDFImage | null }> {
  if (mode !== "digital") return { logo: null, whiteLogo: null };
  let logo: PDFImage | null = null;
  if (s.logo_url) {
    const buf = await tryFetchImage(s.logo_url);
    if (buf) {
      try {
        const isJpg = /\.jpe?g($|\?)/i.test(s.logo_url);
        logo = isJpg ? await pdf.embedJpg(buf) : await pdf.embedPng(buf);
      } catch { /* ignore */ }
    }
  }
  if (!logo) logo = await embedBrandLogo(pdf, "color");
  const whiteLogo = await embedBrandLogo(pdf, "white");
  return { logo, whiteLogo };
}

export async function renderInvoicePdf(
  data: InvoicePdfData,
  opts: { mode?: "digital" | "print"; generatedBy?: GeneratedBy | null } = {},
): Promise<Uint8Array> {
  const mode = opts.mode ?? "digital";
  const { PDFDocument: PDoc, StandardFonts, rgb } = await import("pdf-lib");

  const s = data.settings;
  const brand = hex(rgb, s.brand_color);
  const text = hex(rgb, s.text_color);
  const muted = hex(rgb, s.muted_color);
  const hair = hex(rgb, s.hairline_color);
  const panel = hex(rgb, s.panel_bg_color);
  const white = hex(rgb, "#FFFFFF");

  const pdf: PDFDocument = await PDoc.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const monoBold = await pdf.embedFont(StandardFonts.CourierBold);

  // Logo embedded once, reused on every page.
  let logo: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  if (mode === "digital" && s.logo_url) {
    const buf = await tryFetchImage(s.logo_url);
    if (buf) {
      try {
        const isJpg = /\.jpe?g($|\?)/i.test(s.logo_url);
        logo = isJpg ? await pdf.embedJpg(buf) : await pdf.embedPng(buf);
      } catch { /* ignore */ }
    }
  }

  const CONTENT_TOP = PAGE_H - TOP_MARGIN;
  const CONTENT_BOTTOM = BOTTOM_MARGIN;
  const CONTENT_W = PAGE_W - SIDE * 2;

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = CONTENT_TOP;

  const drawLetterhead = (p: PDFPage) => {
    if (mode !== "digital") return;
    drawBrandHeader(p, logo, brand);
    drawBrandFooter(p, {
      logo: whiteLogo,
      font,
      brand,
      white,
      muted,
      phone: s.company_phone,
      email: s.company_email,
      website: s.company_website,
      generatedBy: opts.generatedBy,
    });
  };

  drawLetterhead(page);

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    drawLetterhead(page);
    y = CONTENT_TOP;
  };

  /** Ensure `need` pt of vertical space remains inside the content box. */
  const ensure = (need: number) => {
    if (y - need < CONTENT_BOTTOM) newPage();
  };

  const draw = (t: string, x: number, yy: number, size: number, f: PDFFont = font, color: RGB = text) => {
    page.drawText(safeText(t), { x, y: yy, size, font: f, color });
  };

  const wrap = (t: string, f: PDFFont, size: number, maxW: number): string[] => {
    const out: string[] = [];
    for (const rawLine of safeText(t).split("\n")) {
      const words = rawLine.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(""); continue; }
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > maxW && line) { out.push(line); line = w; }
        else line = test;
      }
      if (line) out.push(line);
    }
    return out;
  };

  const paragraph = (t: string, size = 9.5, f: PDFFont = font, color: RGB = muted, lead = 12.5) => {
    for (const ln of wrap(t, f, size, CONTENT_W)) {
      ensure(lead);
      draw(ln, SIDE, y - size, size, f, color);
      y -= lead;
    }
  };

  const sectionTitle = (label: string) => {
    ensure(28);
    y -= 6;
    draw(label.toUpperCase(), SIDE, y - 9, 9, bold, brand);
    y -= 13;
    page.drawLine({ start: { x: SIDE, y }, end: { x: PAGE_W - SIDE, y }, thickness: 0.6, color: hair });
    y -= 10;
  };

  /* ---------- title block ---------- */
  const inv = data.invoice;
  const cur = inv.currency || "BDT";

  draw(s.header_text || "INVOICE", SIDE, y - 22, 24, bold, brand);
  const slugW = monoBold.widthOfTextAtSize(inv.slug, 14);
  draw(inv.slug, PAGE_W - SIDE - slugW, y - 20, 14, monoBold, text);
  y -= 30;
  page.drawLine({ start: { x: SIDE, y }, end: { x: PAGE_W - SIDE, y }, thickness: 1, color: brand });
  y -= 14;

  /* ---------- bill to + meta ---------- */
  const colW = (CONTENT_W - 16) / 2;
  const boxTop = y;
  const leftLines: Array<[string, string]> = [
    ["Client", data.customer.company || data.customer.name || "—"],
    ...(data.customer.company && data.customer.name ? ([["Contact", data.customer.name]] as Array<[string, string]>) : []),
    ["Address", data.customer.address || "—"],
    ["Email", data.customer.email || "—"],
    ["Phone", data.customer.phone || "—"],
    ...(data.customer.customer_code ? ([["Customer ID", data.customer.customer_code]] as Array<[string, string]>) : []),
  ];
  const rightLines: Array<[string, string]> = [
    ["Invoice No.", inv.slug],
    ["Issue Date", fmtDate(inv.created_at)],
    ["Due Date", fmtDate(inv.due_date ?? data.installments[0]?.due_date ?? inv.ends_on)],
    ["Project Type", inv.project_type === "monthly_retainer" ? "Monthly Retainer" : "One-time Project"],
    ["Payment Status", inv.status.replace(/_/g, " ").toUpperCase()],
  ];

  const rowsCount = Math.max(leftLines.length, rightLines.length);
  const boxH = 18 + rowsCount * 13;
  ensure(boxH + 10);

  const drawInfoCol = (x: number, rows: Array<[string, string]>, heading: string) => {
    page.drawRectangle({ x, y: boxTop - boxH, width: colW, height: boxH, color: panel, borderColor: hair, borderWidth: 0.5 });
    draw(heading, x + 10, boxTop - 13, 7.5, bold, muted);
    rows.forEach(([k, v], i) => {
      const ry = boxTop - 26 - i * 13;
      draw(k, x + 10, ry, 8, font, muted);
      const valX = x + 78;
      const maxW = colW - 88;
      const [first] = wrap(v, bold, 8.5, maxW);
      draw(first ?? "—", valX, ry, 8.5, bold, text);
    });
  };
  drawInfoCol(SIDE, leftLines, "BILL TO");
  drawInfoCol(SIDE + colW + 16, rightLines, "INVOICE DETAILS");
  y = boxTop - boxH - 16;

  /* ---------- project title / description ---------- */
  ensure(24);
  draw(inv.title, SIDE, y - 12, 13, bold, text);
  y -= 20;
  if (s.sections.description !== false && inv.description) paragraph(inv.description, 9.5);

  /* ---------- line items ---------- */
  const items: InvoiceLineItem[] =
    data.lineItems && data.lineItems.length
      ? data.lineItems
      : [{ sequence: 1, description: inv.title, quantity: 1, unit_price: Number(inv.total_amount) }];

  const subtotal = items.reduce((a, it) => a + Number(it.quantity) * Number(it.unit_price), 0);
  const discount = Number(inv.discount_amount ?? 0);
  const taxPct = Number(inv.tax_percent ?? 0);
  const taxable = Math.max(0, subtotal - discount);
  const tax = +(taxable * (taxPct / 100)).toFixed(2);
  const grand = +(taxable + tax).toFixed(2);
  const paid = Number(inv.paid_amount ?? 0);
  const balance = Math.max(0, +(grand - paid).toFixed(2));

  sectionTitle("Service / Project Description");

  const cSeq = SIDE + 8;
  const cDesc = SIDE + 30;
  const cQty = SIDE + 280;
  const cUnitRight = PAGE_W - SIDE - 118;
  const cAmt = PAGE_W - SIDE - 8;

  const tableHeader = () => {
    ensure(24);
    page.drawRectangle({ x: SIDE, y: y - 18, width: CONTENT_W, height: 18, color: brand });
    draw("#", cSeq, y - 12.5, 8, bold, white);
    draw("DESCRIPTION", cDesc, y - 12.5, 8, bold, white);
    draw("QTY", cQty, y - 12.5, 8, bold, white);
    const uw = bold.widthOfTextAtSize("UNIT PRICE", 8);
    draw("UNIT PRICE", cUnitRight - uw, y - 12.5, 8, bold, white);
    const w = bold.widthOfTextAtSize("AMOUNT", 8);
    draw("AMOUNT", cAmt - w, y - 12.5, 8, bold, white);
    y -= 18;
  };
  tableHeader();

  for (const it of items) {
    const descLines = wrap(it.description, font, 9.5, cQty - cDesc - 12);
    const rowH = Math.max(20, descLines.length * 12 + 8);
    if (y - rowH < CONTENT_BOTTOM) { newPage(); tableHeader(); }
    descLines.forEach((ln, i) => draw(ln, cDesc, y - 13 - i * 12, 9.5, font, text));
    draw(String(it.sequence), cSeq, y - 13, 9, mono, muted);
    draw(Number(it.quantity).toString(), cQty, y - 13, 9.5, font, text);
    const up = money(Number(it.unit_price), cur);
    draw(up, cUnitRight - mono.widthOfTextAtSize(up, 9), y - 13, 9, mono, text);
    const amt = money(Number(it.quantity) * Number(it.unit_price), cur);
    const aw = monoBold.widthOfTextAtSize(amt, 9.5);
    draw(amt, cAmt - aw, y - 13, 9.5, monoBold, text);
    y -= rowH;
    page.drawLine({ start: { x: SIDE, y }, end: { x: PAGE_W - SIDE, y }, thickness: 0.4, color: hair });
  }

  /* ---------- totals ---------- */
  const totalRows: Array<[string, string, boolean]> = [
    ["Subtotal", money(subtotal, cur), false],
    ...(discount > 0 ? ([["Discount", `- ${money(discount, cur)}`, false]] as Array<[string, string, boolean]>) : []),
    ...(taxPct > 0 ? ([[`Tax / VAT (${taxPct}%)`, money(tax, cur), false]] as Array<[string, string, boolean]>) : []),
    ["Total Payable", money(grand, cur), true],
    ...(paid > 0 ? ([["Paid", money(paid, cur), false]] as Array<[string, string, boolean]>) : []),
    ["Balance Due", money(balance, cur), true],
  ];
  const totalsH = 14 + totalRows.length * 16;
  ensure(totalsH + 8);
  y -= 10;
  const tx = PAGE_W - SIDE - 240;
  page.drawRectangle({ x: tx, y: y - totalsH, width: 240, height: totalsH, color: panel, borderColor: hair, borderWidth: 0.5 });
  totalRows.forEach(([label, val, strong], i) => {
    const ry = y - 18 - i * 16;
    draw(label, tx + 12, ry, strong ? 9.5 : 9, strong ? bold : font, strong ? text : muted);
    const f = strong ? monoBold : mono;
    const size = strong ? 10.5 : 9.5;
    const w = f.widthOfTextAtSize(safeText(val), size);
    draw(val, tx + 240 - 12 - w, ry, size, f, strong ? brand : text);
  });
  y -= totalsH + 12;

  /* ---------- amount in words ---------- */
  ensure(30);
  draw("Amount in Words:", SIDE, y - 10, 8.5, bold, muted);
  y -= 11;
  paragraph(amountInWords(grand, cur), 9.5, bold, text, 12);
  y -= 4;

  /* ---------- installment schedule ---------- */
  if (s.sections.installments !== false && data.installments.length > 1) {
    sectionTitle("Payment Schedule");
    ensure(18);
    draw("#", cSeq, y - 10, 8, bold, muted);
    draw("MILESTONE", cDesc, y - 10, 8, bold, muted);
    draw("DUE DATE", cQty, y - 10, 8, bold, muted);
    const hw = bold.widthOfTextAtSize("AMOUNT", 8);
    draw("AMOUNT", cAmt - hw - 60, y - 10, 8, bold, muted);
    draw("STATUS", cAmt - 46, y - 10, 8, bold, muted);
    y -= 16;
    for (const it of data.installments) {
      ensure(18);
      draw(String(it.sequence), cSeq, y - 11, 9, mono, muted);
      draw(wrap(it.label, font, 9.5, cQty - cDesc - 10)[0] ?? "", cDesc, y - 11, 9.5, font, text);
      draw(fmtDate(it.due_date), cQty, y - 11, 9, font, muted);
      const amt = money(Number(it.amount), cur);
      const aw = mono.widthOfTextAtSize(amt, 9);
      draw(amt, cAmt - 60 - aw, y - 11, 9, mono, text);
      draw(it.status.toUpperCase(), cAmt - 46, y - 11, 7.5, bold, it.status === "paid" ? hex(rgb, "#0F766E") : muted);
      y -= 16;
      page.drawLine({ start: { x: SIDE, y: y + 3 }, end: { x: PAGE_W - SIDE, y: y + 3 }, thickness: 0.35, color: hair });
    }
    y -= 4;
  }

  /* ---------- payment information ---------- */
  if (s.sections.payment_info !== false) {
    const infoText = s.payment_info || DEFAULT_PAYMENT_INFO;
    const noteText = s.payment_note || DEFAULT_PAYMENT_NOTE;
    const intro =
      "Please make the payment using the following bank details. After completing the payment, kindly share the transaction receipt or payment confirmation with us for verification.";
    const introLines = wrap(intro, font, 8.5, CONTENT_W - 28);
    const infoLines = infoText.split("\n").map((l) => l.trim()).filter(Boolean);
    const noteLines = wrap(noteText, font, 8, CONTENT_W - 28);
    const blockH = 26 + introLines.length * 11 + 8 + infoLines.length * 11.5 + 12 + noteLines.length * 10 + 12;
    if (y - blockH < CONTENT_BOTTOM) newPage();

    const top = y;
    page.drawRectangle({ x: SIDE, y: top - blockH, width: CONTENT_W, height: blockH, color: panel, borderColor: hair, borderWidth: 0.5 });
    page.drawRectangle({ x: SIDE, y: top - blockH, width: 3, height: blockH, color: brand });
    let iy = top - 16;
    draw("PAYMENT INFORMATION", SIDE + 14, iy, 9, bold, brand);
    iy -= 14;
    introLines.forEach((ln) => { draw(ln, SIDE + 14, iy, 8.5, font, muted); iy -= 11; });
    iy -= 6;
    infoLines.forEach((ln) => {
      const idx = ln.indexOf(":");
      if (idx > 0 && idx < 30) {
        const k = ln.slice(0, idx + 1);
        draw(k, SIDE + 14, iy, 8.5, bold, text);
        draw(ln.slice(idx + 1).trim(), SIDE + 14 + bold.widthOfTextAtSize(safeText(k), 8.5) + 5, iy, 8.5, font, text);
      } else {
        draw(ln, SIDE + 14, iy, 8.5, font, text);
      }
      iy -= 11.5;
    });
    iy -= 6;
    draw("Payment Note:", SIDE + 14, iy, 8, bold, muted);
    iy -= 10;
    noteLines.forEach((ln) => { draw(ln, SIDE + 14, iy, 8, font, muted); iy -= 10; });
    y = top - blockH - 14;
  }

  /* ---------- terms ---------- */
  if (s.sections.terms !== false && inv.terms) {
    sectionTitle("Terms and Conditions");
    paragraph(inv.terms, 8.5, font, muted, 11);
  }

  /* ---------- notes ---------- */
  if (s.sections.notes !== false && inv.notes) {
    sectionTitle("Notes");
    paragraph(inv.notes, 8.5, font, muted, 11);
  }

  /* ---------- signature ---------- */
  ensure(60);
  y -= 24;
  const sigX = PAGE_W - SIDE - 200;
  page.drawLine({ start: { x: sigX, y }, end: { x: PAGE_W - SIDE, y }, thickness: 0.7, color: hair });
  y -= 12;
  draw(s.signature_name || s.company_name, sigX, y, 9.5, bold, text);
  y -= 11;
  draw(s.signature_title || "Authorized Signature", sigX, y, 8.5, font, muted);
  y -= 16;

  /* ---------- page numbers (inside content box) ---------- */
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}  ·  Invoice ${inv.slug}`;
    const t = safeText(label);
    const w = font.widthOfTextAtSize(t, 7.5);
    p.drawText(t, { x: (PAGE_W - w) / 2, y: CONTENT_BOTTOM + 6, size: 7.5, font, color: muted });
  });

  return await pdf.save();
}

/* ================= Expense voucher ================= */

export interface ExpenseVoucherData {
  expense: {
    voucher_no: string | null;
    category: string;
    amount: number;
    currency: string;
    spent_on: string;
    vendor: string | null;
    notes: string | null;
    created_at: string;
    payment_ref?: string | null;
    txn_id?: string | null;
    payment_method?: string | null;
    department?: string | null;
    request_purpose?: string | null;
  };
  linkedInvoiceSlug?: string | null;
  preparedByName?: string | null;
  paidToName?: string | null;
  requestedByName?: string | null;
  settings: PdfSettings;
}

/**
 * Renders a single-page A4 expense voucher using the same letterhead geometry
 * and branding as the invoice PDF. `print` mode leaves the reserved
 * letterhead margins blank for pre-printed paper.
 */
export async function renderExpenseVoucherPdf(
  data: ExpenseVoucherData,
  opts: { mode?: "digital" | "print"; kind?: "expense" | "income" } = {},
): Promise<Uint8Array> {
  const mode = opts.mode ?? "digital";
  const kind = opts.kind ?? "expense";

  const { PDFDocument: PDoc, StandardFonts, rgb } = await import("pdf-lib");

  const s = data.settings;
  const brand = hex(rgb, s.brand_color);
  const text = hex(rgb, s.text_color);
  const muted = hex(rgb, s.muted_color);
  const hair = hex(rgb, s.hairline_color);
  const panel = hex(rgb, s.panel_bg_color);
  const white = hex(rgb, "#FFFFFF");

  const pdf: PDFDocument = await PDoc.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const monoBold = await pdf.embedFont(StandardFonts.CourierBold);

  let logo: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  if (mode === "digital" && s.logo_url) {
    const buf = await tryFetchImage(s.logo_url);
    if (buf) {
      try {
        const isJpg = /\.jpe?g($|\?)/i.test(s.logo_url);
        logo = isJpg ? await pdf.embedJpg(buf) : await pdf.embedPng(buf);
      } catch { /* ignore */ }
    }
  }

  const CONTENT_TOP = PAGE_H - TOP_MARGIN;
  const CONTENT_BOTTOM = BOTTOM_MARGIN;
  const CONTENT_W = PAGE_W - SIDE * 2;

  const page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = CONTENT_TOP;

  const draw = (t: string, x: number, yy: number, size: number, f: PDFFont = font, color: RGB = text) => {
    page.drawText(safeText(t), { x, y: yy, size, font: f, color });
  };
  const wrap = (t: string, f: PDFFont, size: number, maxW: number): string[] => {
    const out: string[] = [];
    for (const rawLine of safeText(t).split("\n")) {
      const words = rawLine.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(""); continue; }
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > maxW && line) { out.push(line); line = w; }
        else line = test;
      }
      if (line) out.push(line);
    }
    return out;
  };

  /* ---- letterhead (digital only) ---- */
  if (mode === "digital") {
    const bandH = 92;
    const bandY = PAGE_H - bandH;
    page.drawRectangle({ x: PAGE_W * 0.55, y: bandY, width: PAGE_W * 0.45, height: bandH, color: brand });
    page.drawRectangle({ x: 0, y: bandY - 6, width: PAGE_W, height: 5, color: brand });
    let lx = SIDE;
    if (logo) {
      const h = 40;
      const w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x: SIDE, y: bandY + (bandH - h) / 2, width: w, height: h });
      lx = SIDE + w + 10;
    }
    draw(s.company_name, lx, bandY + 48, 22, bold, brand);
    if (s.company_tagline) draw(s.company_tagline, lx, bandY + 32, 8.5, font, muted);

    const rx = PAGE_W * 0.55 + 14;
    draw("Creative Technology Company", rx, bandY + 68, 9, font, white);
    draw("Grow Smarter with AI", rx, bandY + 55, 11, bold, white);
    if (s.company_address) {
      const maxW = PAGE_W - rx - 14;
      const raw = s.company_address.split(/\n|;/).map((l) => safeText(l).trim()).filter(Boolean);
      const lines: string[] = [];
      for (const ln of raw) lines.push(...wrap(ln, font, 7.5, maxW));
      draw("Address:", rx, bandY + 38, 8, bold, white);
      lines.slice(0, 3).forEach((ln, i) => draw(ln, rx, bandY + 27 - i * 9.5, 7.5, font, white));
    }

    const fH = 20;
    page.drawRectangle({ x: 0, y: 24, width: PAGE_W, height: fH, color: brand });
    const segs = [
      s.company_phone ? `Phone: ${s.company_phone}` : null,
      s.company_email ? `Email: ${s.company_email}` : null,
      s.company_website ? `Web: ${s.company_website.replace(/^https?:\/\//, "")}` : null,
    ].filter(Boolean) as string[];
    const segW = PAGE_W / Math.max(1, segs.length);
    segs.forEach((t, i) => {
      const w = font.widthOfTextAtSize(safeText(t), 8.5);
      draw(t, i * segW + (segW - w) / 2, 30, 8.5, font, white);
      if (i > 0) page.drawLine({ start: { x: i * segW, y: 24 }, end: { x: i * segW, y: 24 + fH }, thickness: 1, color: white });
    });
    const foot = safeText(s.footer_text);
    const fw = font.widthOfTextAtSize(foot, 7.5);
    draw(foot, (PAGE_W - fw) / 2, 12, 7.5, font, muted);
  }

  const e = data.expense;
  const cur = (e.currency || "BDT").toUpperCase();
  const voucherNo = e.voucher_no || "—";

  /* ---- title ---- */
  y -= 18;
  draw(kind === "income" ? "MONEY RECEIPT" : "EXPENSE VOUCHER", SIDE, y, 20, bold, brand);
  const metaX = PAGE_W - SIDE - 180;
  draw(kind === "income" ? "Receipt No." : "Voucher No.", metaX, y + 6, 8, bold, muted);
  draw(voucherNo, metaX, y - 7, 12, monoBold, text);
  y -= 14;
  draw(kind === "income" ? "Income received record" : "Internal payment record", SIDE, y, 9, font, muted);
  y -= 12;
  page.drawLine({ start: { x: SIDE, y }, end: { x: PAGE_W - SIDE, y }, thickness: 0.8, color: brand });
  y -= 22;

  /* ---- detail grid ---- */
  const rows: Array<[string, string]> =
    kind === "income"
      ? [
          ["Date Received", fmtDate(e.spent_on)],
          ["Income Type", e.category.charAt(0).toUpperCase() + e.category.slice(1)],
          ["Project / Reference", e.department || "—"],
          ["Received From", e.vendor || "—"],
          ["Received By", data.paidToName || data.preparedByName || "—"],
          ["Payment Method", e.payment_method || "—"],
          ["Transaction ID (TrxID)", e.txn_id || e.payment_ref || "—"],
          ["Linked Invoice", data.linkedInvoiceSlug || "—"],
          ["Recorded On", fmtDate(e.created_at)],
        ]
      : [
          ["Date of Expense", fmtDate(e.spent_on)],
          ["Category", e.category.charAt(0).toUpperCase() + e.category.slice(1)],
          ["Department", e.department || "—"],
          ["Requested By", data.requestedByName || "—"],
          ["Paid To / Vendor", e.vendor || "—"],
          ["Paid By", data.paidToName || "—"],
          ["Payment Method", e.payment_method || "—"],
          ["Transaction ID (TrxID)", e.txn_id || e.payment_ref || "—"],
          ["Linked Invoice", data.linkedInvoiceSlug || "—"],
          ["Recorded On", fmtDate(e.created_at)],
        ];


  const colW = CONTENT_W / 2;
  const rowH = 26;
  const gridH = Math.ceil(rows.length / 2) * rowH;
  page.drawRectangle({ x: SIDE, y: y - gridH, width: CONTENT_W, height: gridH, color: panel, borderColor: hair, borderWidth: 0.5 });
  rows.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = SIDE + col * colW + 12;
    const ty = y - row * rowH - 11;
    draw(k.toUpperCase(), x, ty, 7, bold, muted);
    draw(v, x, ty - 11, 10, font, text);
  });
  y -= gridH + 20;

  /* ---- amount block ---- */
  const amtH = 58;
  page.drawRectangle({ x: SIDE, y: y - amtH, width: CONTENT_W, height: amtH, borderColor: hair, borderWidth: 0.5 });
  page.drawRectangle({ x: SIDE, y: y - amtH, width: 3, height: amtH, color: brand });
  draw("AMOUNT", SIDE + 14, y - 16, 8, bold, muted);
  const amtStr = money(Number(e.amount), cur);
  const aw = monoBold.widthOfTextAtSize(safeText(amtStr), 18);
  draw(amtStr, PAGE_W - SIDE - 14 - aw, y - 22, 18, monoBold, brand);
  draw("In words", SIDE + 14, y - 34, 7.5, bold, muted);
  wrap(amountInWords(Number(e.amount), cur), font, 9, CONTENT_W - 28).slice(0, 2).forEach((ln, i) => {
    draw(ln, SIDE + 14, y - 45 - i * 10, 9, font, text);
  });
  y -= amtH + 20;

  /* ---- purpose / notes ---- */
  const purposeBody = [
    e.request_purpose ? `Purpose of request: ${e.request_purpose}` : null,
    e.notes || null,
  ].filter(Boolean).join("\n");
  if (purposeBody) {
    draw("PURPOSE / NOTES", SIDE, y, 8.5, bold, brand);
    y -= 6;
    page.drawLine({ start: { x: SIDE, y }, end: { x: PAGE_W - SIDE, y }, thickness: 0.5, color: hair });
    y -= 14;
    wrap(purposeBody, font, 9, CONTENT_W).slice(0, 12).forEach((ln) => { draw(ln, SIDE, y, 9, font, muted); y -= 11; });
    y -= 8;
  }


  /* ---- signature / seal ---- */
  const sealTop = Math.min(y, CONTENT_BOTTOM + 170);
  const boxH = 96;
  const boxW = (CONTENT_W - 16) / 2;
  const boxes: Array<[string, string]> =
    kind === "income"
      ? [
          ["Received By (Accounts)", data.preparedByName || s.signature_name || s.company_name],
          ["Authorized Signature & Company Seal", s.signature_title || "Authorized Signature"],
        ]
      : [
          ["Prepared By", data.preparedByName || s.signature_name || s.company_name],
          ["Authorized Signature & Company Seal", s.signature_title || "Authorized Signature"],
        ];
  boxes.forEach(([label, name], i) => {
    const x = SIDE + i * (boxW + 16);
    page.drawRectangle({ x, y: sealTop - boxH, width: boxW, height: boxH, borderColor: hair, borderWidth: 0.5 });
    draw(label.toUpperCase(), x + 10, sealTop - 14, 7, bold, muted);
    page.drawLine({ start: { x: x + 10, y: sealTop - boxH + 26 }, end: { x: x + boxW - 10, y: sealTop - boxH + 26 }, thickness: 0.6, color: hair });
    draw(name, x + 10, sealTop - boxH + 13, 8.5, font, text);
  });

  /* ---- footer id line ---- */
  const label = `${kind === "income" ? "Money Receipt" : "Expense Voucher"} ${voucherNo}  ·  ${s.company_name}`;

  const w = font.widthOfTextAtSize(safeText(label), 7.5);
  page.drawText(safeText(label), { x: (PAGE_W - w) / 2, y: CONTENT_BOTTOM + 6, size: 7.5, font, color: muted });

  void mono;
  return await pdf.save();
}

/* ================= Salary slip ================= */

export interface SalarySlipPdfData {
  slip: {
    slip_no: string | null;
    period_month: string;
    currency: string;
    base_amount: number;
    components: Array<{ label: string; amount: number; invoice_slug?: string | null }>;
    net_amount: number;
    reason: string | null;
    payment_method: string | null;
    bank_name?: string | null;
    txn_id: string | null;
    paid_on: string;
    status: string;
    created_at: string;
  };
  employeeName?: string | null;
  employeeCode?: string | null;
  employeeRole?: string | null;
  preparedByName?: string | null;
  settings: PdfSettings;
}

/* --- Code 128B encoder (bar widths only; drawn with pdf-lib rectangles) --- */
const C128_PATTERNS = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112",
];

/** Returns an array of {x,w,bar} bar segments normalised to `width` pt. */
function code128Bars(value: string, width: number, moduleMin = 0.9) {
  const chars = value.replace(/[^\x20-\x7E]/g, "").slice(0, 24);
  const codes: number[] = [104]; // Start B
  for (const ch of chars) codes.push(ch.charCodeAt(0) - 32);
  let sum = 104;
  codes.slice(1).forEach((c, i) => { sum += c * (i + 1); });
  codes.push(sum % 103);
  codes.push(106); // stop
  const widths: number[] = [];
  for (const c of codes) for (const d of C128_PATTERNS[c] ?? "") widths.push(Number(d));
  const total = widths.reduce((a, b) => a + b, 0);
  const mod = Math.max(moduleMin, width / total);
  const bars: Array<{ x: number; w: number }> = [];
  let x = 0;
  widths.forEach((w, i) => {
    const seg = w * mod;
    if (i % 2 === 0) bars.push({ x, w: seg });
    x += seg;
  });
  return { bars, totalWidth: x };
}


function monthLabel(d: string): string {
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Single-page A4 salary slip. Shares the letterhead geometry and branding of
 * the invoice/voucher PDFs; `print` mode leaves letterhead margins blank.
 */
export async function renderSalarySlipPdf(
  data: SalarySlipPdfData,
  opts: { mode?: "digital" | "print" } = {},
): Promise<Uint8Array> {
  const mode = opts.mode ?? "digital";
  const { PDFDocument: PDoc, StandardFonts, rgb } = await import("pdf-lib");

  const s = data.settings;
  const brand = hex(rgb, s.brand_color);
  const text = hex(rgb, s.text_color);
  const muted = hex(rgb, s.muted_color);
  const hair = hex(rgb, s.hairline_color);
  const panel = hex(rgb, s.panel_bg_color);
  const white = hex(rgb, "#FFFFFF");

  const pdf: PDFDocument = await PDoc.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const monoBold = await pdf.embedFont(StandardFonts.CourierBold);

  let logo: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  if (mode === "digital" && s.logo_url) {
    const buf = await tryFetchImage(s.logo_url);
    if (buf) {
      try {
        const isJpg = /\.jpe?g($|\?)/i.test(s.logo_url);
        logo = isJpg ? await pdf.embedJpg(buf) : await pdf.embedPng(buf);
      } catch { /* ignore */ }
    }
  }

  const CONTENT_TOP = PAGE_H - TOP_MARGIN;
  const CONTENT_BOTTOM = BOTTOM_MARGIN;
  const CONTENT_W = PAGE_W - SIDE * 2;

  const page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = CONTENT_TOP;

  const draw = (t: string, x: number, yy: number, size: number, f: PDFFont = font, color: RGB = text) => {
    page.drawText(safeText(t), { x, y: yy, size, font: f, color });
  };
  const wrap = (t: string, f: PDFFont, size: number, maxW: number): string[] => {
    const out: string[] = [];
    for (const rawLine of safeText(t).split("\n")) {
      const words = rawLine.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(""); continue; }
      let line = "";
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > maxW && line) { out.push(line); line = w; }
        else line = test;
      }
      if (line) out.push(line);
    }
    return out;
  };

  if (mode === "digital") {
    const bandH = 92;
    const bandY = PAGE_H - bandH;
    page.drawRectangle({ x: PAGE_W * 0.55, y: bandY, width: PAGE_W * 0.45, height: bandH, color: brand });
    page.drawRectangle({ x: 0, y: bandY - 6, width: PAGE_W, height: 5, color: brand });
    let lx = SIDE;
    if (logo) {
      const h = 40;
      const w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x: SIDE, y: bandY + (bandH - h) / 2, width: w, height: h });
      lx = SIDE + w + 10;
    }
    draw(s.company_name, lx, bandY + 48, 22, bold, brand);
    if (s.company_tagline) draw(s.company_tagline, lx, bandY + 32, 8.5, font, muted);

    const rx = PAGE_W * 0.55 + 14;
    draw("Creative Technology Company", rx, bandY + 68, 9, font, white);
    draw("Grow Smarter with AI", rx, bandY + 55, 11, bold, white);
    if (s.company_address) {
      const maxW = PAGE_W - rx - 14;
      const raw = s.company_address.split(/\n|;/).map((l) => safeText(l).trim()).filter(Boolean);
      const lines: string[] = [];
      for (const ln of raw) lines.push(...wrap(ln, font, 7.5, maxW));
      draw("Address:", rx, bandY + 38, 8, bold, white);
      lines.slice(0, 3).forEach((ln, i) => draw(ln, rx, bandY + 27 - i * 9.5, 7.5, font, white));
    }

    const fH = 20;
    page.drawRectangle({ x: 0, y: 24, width: PAGE_W, height: fH, color: brand });
    const segs = [
      s.company_phone ? `Phone: ${s.company_phone}` : null,
      s.company_email ? `Email: ${s.company_email}` : null,
      s.company_website ? `Web: ${s.company_website.replace(/^https?:\/\//, "")}` : null,
    ].filter(Boolean) as string[];
    const segW = PAGE_W / Math.max(1, segs.length);
    segs.forEach((t, i) => {
      const w = font.widthOfTextAtSize(safeText(t), 8.5);
      draw(t, i * segW + (segW - w) / 2, 30, 8.5, font, white);
      if (i > 0) page.drawLine({ start: { x: i * segW, y: 24 }, end: { x: i * segW, y: 24 + fH }, thickness: 1, color: white });
    });
    const foot = safeText(s.footer_text);
    const fw = font.widthOfTextAtSize(foot, 7.5);
    draw(foot, (PAGE_W - fw) / 2, 12, 7.5, font, muted);
  }

  const sl = data.slip;
  const cur = (sl.currency || "BDT").toUpperCase();
  const slipNo = sl.slip_no || "—";

  /* ---- title ---- */
  y -= 18;
  draw("SALARY SLIP", SIDE, y, 20, bold, brand);
  const metaX = PAGE_W - SIDE - 180;
  draw("Slip No.", metaX, y + 6, 8, bold, muted);
  draw(slipNo, metaX, y - 7, 12, monoBold, text);
  y -= 14;
  draw(`Salary period: ${monthLabel(sl.period_month)}`, SIDE, y, 9, font, muted);
  y -= 12;
  page.drawLine({ start: { x: SIDE, y }, end: { x: PAGE_W - SIDE, y }, thickness: 0.8, color: brand });
  y -= 22;

  if (sl.status === "void") {
    draw("VOID", PAGE_W - SIDE - 60, y + 30, 26, bold, hex(rgb, "#DC2626"));
  }

  /* ---- employee + payment panel ---- */
  const rows: Array<[string, string]> = [
    ["Employee", data.employeeName || "—"],
    ["Employee ID", data.employeeCode || "—"],
    ["Designation", data.employeeRole || "—"],
    ["Salary Month", monthLabel(sl.period_month)],
    ["Payment Date", fmtDate(sl.paid_on)],
    ["Payment Method", sl.payment_method || "—"],
    ["Bank / Wallet", sl.bank_name || "—"],
    ["Transaction ID (TrxID)", sl.txn_id || "—"],
  ];
  const colW = CONTENT_W / 2;
  const rowH = 26;
  const gridH = Math.ceil(rows.length / 2) * rowH;
  page.drawRectangle({ x: SIDE, y: y - gridH, width: CONTENT_W, height: gridH, color: panel, borderColor: hair, borderWidth: 0.5 });
  rows.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = SIDE + col * colW + 12;
    const ty = y - row * rowH - 11;
    draw(k.toUpperCase(), x, ty, 7, bold, muted);
    draw(v, x, ty - 11, 10, font, text);
  });
  y -= gridH + 10;

  /* ---- employee ID barcode ---- */
  if (data.employeeCode) {
    const bcW = 150;
    const bcH = 26;
    const bcX = PAGE_W - SIDE - bcW;
    const { bars, totalWidth } = code128Bars(data.employeeCode, bcW, 0.85);
    const scale = totalWidth > bcW ? bcW / totalWidth : 1;
    bars.forEach((b) => {
      page.drawRectangle({
        x: bcX + b.x * scale,
        y: y - bcH,
        width: Math.max(0.5, b.w * scale),
        height: bcH,
        color: text,
      });
    });
    const cw = font.widthOfTextAtSize(safeText(data.employeeCode), 7);
    draw(data.employeeCode, bcX + (bcW - cw) / 2, y - bcH - 8, 7, font, muted);
    draw("Issued on", SIDE, y - 12, 7, bold, muted);
    draw(fmtDate(sl.created_at), SIDE, y - 23, 9.5, font, text);
    y -= bcH + 22;
  } else {
    y -= 4;
  }

  /* ---- pay breakdown table ---- */
  draw("PAY BREAKDOWN", SIDE, y, 8.5, bold, brand);
  y -= 6;
  page.drawLine({ start: { x: SIDE, y }, end: { x: PAGE_W - SIDE, y }, thickness: 0.5, color: brand });
  y -= 13;

  const refX = SIDE + 22;
  const descX = SIDE + 100;
  draw("#", SIDE + 4, y, 7, bold, muted);
  draw("REFERENCE", refX, y, 7, bold, muted);
  draw("DESCRIPTION", descX, y, 7, bold, muted);
  const amtHead = "AMOUNT";
  draw(amtHead, PAGE_W - SIDE - 4 - bold.widthOfTextAtSize(amtHead, 7), y, 7, bold, muted);
  y -= 6;
  page.drawLine({ start: { x: SIDE, y }, end: { x: PAGE_W - SIDE, y }, thickness: 0.5, color: hair });
  y -= 14;

  const lines: Array<{ ref: string; label: string; amount: number }> = [
    { ref: "—", label: "Basic salary", amount: Number(sl.base_amount) },
    ...(sl.components ?? []).map((c) => ({
      ref: c.invoice_slug || "—",
      label: c.label,
      amount: Number(c.amount),
    })),
  ];
  lines.forEach((ln, i) => {
    draw(String(i + 1), SIDE + 4, y, 9, font, muted);
    draw(ln.ref, refX, y, 9, ln.ref === "—" ? font : monoBold, ln.ref === "—" ? muted : brand);
    const descLines = wrap(ln.label, font, 9.5, PAGE_W - SIDE - 90 - descX);
    draw(descLines[0] ?? "", descX, y, 9.5, font, text);
    const t = `${ln.amount < 0 ? "-" : ""}${money(Math.abs(ln.amount), cur)}`;
    const w2 = font.widthOfTextAtSize(safeText(t), 9.5);
    draw(t, PAGE_W - SIDE - 4 - w2, y, 9.5, font, ln.amount < 0 ? hex(rgb, "#B91C1C") : text);
    y -= 13;
    descLines.slice(1, 2).forEach((extra) => { draw(extra, descX, y, 8.5, font, muted); y -= 11; });
    page.drawLine({ start: { x: SIDE, y: y + 5 }, end: { x: PAGE_W - SIDE, y: y + 5 }, thickness: 0.3, color: hair });
  });
  y -= 10;

  /* ---- net payable ---- */
  const amtH = 58;
  page.drawRectangle({ x: SIDE, y: y - amtH, width: CONTENT_W, height: amtH, borderColor: hair, borderWidth: 0.5 });
  page.drawRectangle({ x: SIDE, y: y - amtH, width: 3, height: amtH, color: brand });
  draw("NET PAYABLE", SIDE + 14, y - 16, 8, bold, muted);
  const amtStr = money(Number(sl.net_amount), cur);
  const aw = monoBold.widthOfTextAtSize(safeText(amtStr), 18);
  draw(amtStr, PAGE_W - SIDE - 14 - aw, y - 22, 18, monoBold, brand);
  draw("In words", SIDE + 14, y - 34, 7.5, bold, muted);
  wrap(amountInWords(Number(sl.net_amount), cur), font, 9, CONTENT_W - 28).slice(0, 2).forEach((ln, i) => {
    draw(ln, SIDE + 14, y - 45 - i * 10, 9, font, text);
  });
  y -= amtH + 18;

  /* ---- reason / remarks ---- */
  if (sl.reason) {
    draw("REMARKS", SIDE, y, 8.5, bold, brand);
    y -= 6;
    page.drawLine({ start: { x: SIDE, y }, end: { x: PAGE_W - SIDE, y }, thickness: 0.5, color: hair });
    y -= 14;
    wrap(sl.reason, font, 9, CONTENT_W).slice(0, 6).forEach((ln) => { draw(ln, SIDE, y, 9, font, muted); y -= 11; });
    y -= 8;
  }

  /* ---- signatures ---- */
  const sealTop = Math.min(y, CONTENT_BOTTOM + 150);
  const boxH = 92;
  const boxW = (CONTENT_W - 16) / 2;
  const boxes: Array<[string, string, string]> = [
    ["Employee Signature", data.employeeName || "—", data.employeeRole || "Employee"],
    ["Authorized Signature & Company Seal", "MD. Nahid Hasan", "Accounts Manager"],
  ];
  boxes.forEach(([label, name, sub], i) => {
    const x = SIDE + i * (boxW + 16);
    page.drawRectangle({ x, y: sealTop - boxH, width: boxW, height: boxH, borderColor: hair, borderWidth: 0.5 });
    draw(label.toUpperCase(), x + 10, sealTop - 14, 7, bold, muted);
    page.drawLine({
      start: { x: x + 10, y: sealTop - boxH + 30 },
      end: { x: x + boxW - 10, y: sealTop - boxH + 30 },
      thickness: 0.6,
      color: hair,
    });
    draw(name, x + 10, sealTop - boxH + 18, 9, bold, text);
    draw(sub, x + 10, sealTop - boxH + 8, 7.5, font, muted);
  });

  /* ---- verification footer ---- */
  const printedAt = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const left = `Verified online · ${(s.company_website || "brantatech.com").replace(/^https?:\/\//, "")} · Slip ${slipNo}`;
  const right = `Printed: ${printedAt} (GMT+6)`;
  draw(left, SIDE, CONTENT_BOTTOM + 6, 7, font, muted);
  const rw = font.widthOfTextAtSize(safeText(right), 7);
  draw(right, PAGE_W - SIDE - rw, CONTENT_BOTTOM + 6, 7, font, muted);

  return await pdf.save();
}

