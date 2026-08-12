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

import type { PDFDocument, PDFFont, PDFPage, RGB } from "pdf-lib";

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

export async function renderInvoicePdf(
  data: InvoicePdfData,
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
    // ---- header band (inside reserved top margin) ----
    const bandH = 92;
    const bandY = PAGE_H - bandH;
    // right angled orange block
    p.drawRectangle({ x: PAGE_W * 0.55, y: bandY, width: PAGE_W * 0.45, height: bandH, color: brand });
    // orange rule under the whole band
    p.drawRectangle({ x: 0, y: bandY - 6, width: PAGE_W, height: 5, color: brand });

    let lx = SIDE;
    if (logo) {
      const h = 40;
      const w = (logo.width / logo.height) * h;
      p.drawImage(logo, { x: SIDE, y: bandY + (bandH - h) / 2, width: w, height: h });
      lx = SIDE + w + 10;
    }
    p.drawText(safeText(s.company_name), { x: lx, y: bandY + 48, size: 22, font: bold, color: brand });
    if (s.company_tagline) {
      p.drawText(safeText(s.company_tagline), { x: lx, y: bandY + 32, size: 8.5, font, color: muted });
    }

    const rx = PAGE_W * 0.55 + 14;
    p.drawText("Creative Technology Company", { x: rx, y: bandY + 68, size: 9, font, color: white });
    p.drawText("Grow Smarter with AI", { x: rx, y: bandY + 55, size: 11, font: bold, color: white });
    if (s.company_address) {
      const maxW = PAGE_W - rx - 14;
      const raw = s.company_address.split(/\n|;/).map((l) => safeText(l).trim()).filter(Boolean);
      const lines: string[] = [];
      for (const ln of raw) {
        let cur = "";
        for (const word of ln.split(/\s+/)) {
          const test = cur ? `${cur} ${word}` : word;
          if (font.widthOfTextAtSize(test, 7.5) > maxW && cur) { lines.push(cur); cur = word; }
          else cur = test;
        }
        if (cur) lines.push(cur);
      }
      p.drawText("Address:", { x: rx, y: bandY + 38, size: 8, font: bold, color: white });
      lines.slice(0, 3).forEach((ln, i) => {
        p.drawText(ln, { x: rx, y: bandY + 27 - i * 9.5, size: 7.5, font, color: white });
      });
    }

    // ---- footer band (inside reserved bottom margin) ----
    const fH = 20;
    p.drawRectangle({ x: 0, y: 24, width: PAGE_W, height: fH, color: brand });
    const segs = [
      s.company_phone ? `Phone: ${s.company_phone}` : null,
      s.company_email ? `Email: ${s.company_email}` : null,
      s.company_website ? `Web: ${s.company_website.replace(/^https?:\/\//, "")}` : null,
    ].filter(Boolean) as string[];
    const segW = PAGE_W / Math.max(1, segs.length);
    segs.forEach((t, i) => {
      const w = font.widthOfTextAtSize(safeText(t), 8.5);
      p.drawText(safeText(t), { x: i * segW + (segW - w) / 2, y: 30, size: 8.5, font, color: white });
      if (i > 0) p.drawLine({ start: { x: i * segW, y: 24 }, end: { x: i * segW, y: 24 + fH }, thickness: 1, color: white });
    });
    const foot = safeText(s.footer_text);
    const fw = font.widthOfTextAtSize(foot, 7.5);
    p.drawText(foot, { x: (PAGE_W - fw) / 2, y: 12, size: 7.5, font, color: muted });
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
