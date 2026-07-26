// Server-only: renders a branded invoice PDF using pdf-lib.
// Never import from client code.

import type { PDFDocument, PDFFont, PDFPage, RGB } from "pdf-lib";

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
    notes: string | null;
    created_at: string;
  };
  customer: {
    name: string | null;
    customer_code: string | null;
    email: string | null;
    company: string | null;
    phone: string | null;
  };
  installments: Array<{
    sequence: number;
    label: string;
    due_date: string;
    amount: number;
    status: string;
    paid_at: string | null;
  }>;
  settings: PdfSettings;
}

export interface PdfSettings {
  company_name: string;
  company_tagline: string | null;
  company_address: string | null;
  company_email: string | null;
  company_website: string | null;
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
  sections: {
    description?: boolean;
    installments?: boolean;
    stakeholders?: boolean;
    notes?: boolean;
    footer?: boolean;
  };
}

function hex(rgbFn: (r: number, g: number, b: number) => RGB, h: string): RGB {
  const s = h.replace("#", "");
  const full = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(full || "000000", 16);
  return rgbFn(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function money(n: number, cur: string): string {
  const sym = cur === "BDT" ? "BDT " : cur === "USD" ? "USD " : `${cur} `;
  return sym + Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeText(s: string | null | undefined): string {
  // pdf-lib's WinAnsi can't render arbitrary Unicode. Fall back to ASCII-safe transliteration.
  const v = (s ?? "").toString();
  return v
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2022]/g, "*")
    .replace(/[^\x20-\x7E]/g, "?");
}

async function tryFetchPngLogo(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf;
  } catch {
    return null;
  }
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Uint8Array> {
  const { PDFDocument: PDoc, StandardFonts, rgb } = await import("pdf-lib");
  const s = data.settings;
  const brand = hex(rgb, s.brand_color);
  const text = hex(rgb, s.text_color);
  const muted = hex(rgb, s.muted_color);
  const hair = hex(rgb, s.hairline_color);
  const panel = hex(rgb, s.panel_bg_color);

  const pdf: PDFDocument = await PDoc.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const monoBold = await pdf.embedFont(StandardFonts.CourierBold);

  const page: PDFPage = pdf.addPage([595.28, 841.89]); // A4
  const W = page.getWidth();
  const H = page.getHeight();
  const M = 48;

  const draw = (
    t: string,
    x: number,
    y: number,
    size: number,
    f: PDFFont = font,
    color: RGB = text,
  ) => {
    page.drawText(safeText(t), { x, y, size, font: f, color });
  };

  // Header band
  page.drawRectangle({ x: 0, y: H - 110, width: W, height: 110, color: hex(rgb, s.header_bg_color) });

  // Logo
  let cursorX = M;
  if (s.logo_url) {
    const buf = await tryFetchPngLogo(s.logo_url);
    if (buf) {
      try {
        const img = s.logo_url.toLowerCase().endsWith(".jpg") || s.logo_url.toLowerCase().endsWith(".jpeg")
          ? await pdf.embedJpg(buf)
          : await pdf.embedPng(buf);
        const h = 40;
        const w = (img.width / img.height) * h;
        page.drawImage(img, { x: M, y: H - 70, width: w, height: h });
        cursorX = M + w + 12;
      } catch { /* ignore bad image */ }
    }
  }

  draw(s.company_name, cursorX, H - 45, 16, bold);
  if (s.company_tagline) draw(s.company_tagline, cursorX, H - 62, 9, font, muted);
  if (s.company_address) draw(s.company_address, cursorX, H - 76, 8.5, font, muted);
  if (s.company_email) draw(s.company_email, cursorX, H - 88, 8.5, font, muted);

  // Right side: INVOICE title
  const title = s.header_text;
  const titleWidth = bold.widthOfTextAtSize(title, 24);
  draw(title, W - M - titleWidth, H - 50, 24, bold, brand);
  const slugW = monoBold.widthOfTextAtSize(data.invoice.slug, 12);
  draw(data.invoice.slug, W - M - slugW, H - 68, 12, monoBold, text);
  const dateStr = `Issued ${new Date(data.invoice.created_at).toLocaleDateString("en-GB")}`;
  const dateW = font.widthOfTextAtSize(dateStr, 9);
  draw(dateStr, W - M - dateW, H - 82, 9, font, muted);
  const statusStr = data.invoice.status.replace("_", " ").toUpperCase();
  const statusW = bold.widthOfTextAtSize(statusStr, 9);
  draw(statusStr, W - M - statusW, H - 96, 9, bold, brand);

  // Hairline
  page.drawLine({
    start: { x: M, y: H - 118 }, end: { x: W - M, y: H - 118 },
    thickness: 0.5, color: hair,
  });

  // Bill-to panel
  let y = H - 148;
  page.drawRectangle({
    x: M, y: y - 66, width: W - M * 2, height: 74,
    color: panel, borderColor: hair, borderWidth: 0.5,
  });
  draw("BILL TO", M + 12, y - 10, 8, bold, muted);
  draw(data.customer.name ?? "—", M + 12, y - 26, 12, bold);
  if (data.customer.company) draw(data.customer.company, M + 12, y - 40, 9.5, font, muted);
  if (data.customer.email) draw(data.customer.email, M + 12, y - 52, 9, font, muted);
  if (data.customer.customer_code) {
    const cc = `Customer: ${data.customer.customer_code}`;
    const w = mono.widthOfTextAtSize(cc, 9);
    draw(cc, W - M - 12 - w, y - 10, 9, mono, muted);
  }
  const projLabel = data.invoice.project_type === "monthly_retainer" ? "MONTHLY RETAINER" : "ONE-TIME PROJECT";
  const plW = bold.widthOfTextAtSize(projLabel, 8);
  draw(projLabel, W - M - 12 - plW, y - 26, 8, bold, brand);

  y -= 90;

  // Title / description
  draw(data.invoice.title, M, y, 14, bold);
  y -= 18;
  if (s.sections.description !== false && data.invoice.description) {
    const desc = safeText(data.invoice.description);
    const maxW = W - M * 2;
    const words = desc.split(/\s+/);
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(test, 10) > maxW) {
        draw(line, M, y, 10, font, muted); y -= 13; line = w;
      } else line = test;
    }
    if (line) { draw(line, M, y, 10, font, muted); y -= 13; }
    y -= 4;
  }

  // Installments table
  if (s.sections.installments !== false) {
    y -= 10;
    page.drawRectangle({
      x: M, y: y - 18, width: W - M * 2, height: 22,
      color: brand,
    });
    draw("#", M + 10, y - 12, 9, bold, hex(rgb, "#FFFFFF"));
    draw("DESCRIPTION", M + 40, y - 12, 9, bold, hex(rgb, "#FFFFFF"));
    draw("DUE", M + 280, y - 12, 9, bold, hex(rgb, "#FFFFFF"));
    const amtHdr = "AMOUNT";
    const amtHdrW = bold.widthOfTextAtSize(amtHdr, 9);
    draw(amtHdr, W - M - 80 - amtHdrW / 2, y - 12, 9, bold, hex(rgb, "#FFFFFF"));
    draw("STATUS", W - M - 42, y - 12, 9, bold, hex(rgb, "#FFFFFF"));
    y -= 22;

    for (const inst of data.installments) {
      const rowH = 22;
      page.drawLine({
        start: { x: M, y: y - 1 }, end: { x: W - M, y: y - 1 },
        thickness: 0.4, color: hair,
      });
      draw(String(inst.sequence), M + 10, y - 15, 9.5, mono, muted);
      draw(inst.label, M + 40, y - 15, 10, font);
      draw(inst.due_date ?? "—", M + 280, y - 15, 9.5, font, muted);
      const amt = money(inst.amount, data.invoice.currency);
      const amtW = monoBold.widthOfTextAtSize(amt, 10);
      draw(amt, W - M - 100 - amtW, y - 15, 10, monoBold);
      const st = inst.status.toUpperCase();
      draw(st, W - M - 42, y - 15, 8, bold, inst.status === "paid" ? hex(rgb, "#0F766E") : muted);
      y -= rowH;
      if (y < 200) break;
    }
  }

  // Totals card
  y -= 12;
  const totalsX = W - M - 220;
  page.drawRectangle({
    x: totalsX, y: y - 78, width: 220, height: 82,
    color: panel, borderColor: hair, borderWidth: 0.5,
  });
  const outstanding = Math.max(0, Number(data.invoice.total_amount) - Number(data.invoice.paid_amount));
  const row = (label: string, val: string, ry: number, valBold = false, tone: RGB = text) => {
    draw(label, totalsX + 14, ry, 9, font, muted);
    const f = valBold ? monoBold : mono;
    const size = valBold ? 12 : 10;
    const w = f.widthOfTextAtSize(val, size);
    draw(val, totalsX + 220 - 14 - w, ry - (valBold ? 1 : 0), size, f, tone);
  };
  row("Subtotal", money(data.invoice.total_amount, data.invoice.currency), y - 14);
  row("Paid", money(data.invoice.paid_amount, data.invoice.currency), y - 34, false, hex(rgb, "#0F766E"));
  page.drawLine({
    start: { x: totalsX + 14, y: y - 46 }, end: { x: totalsX + 206, y: y - 46 },
    thickness: 0.5, color: hair,
  });
  row("Balance Due", money(outstanding, data.invoice.currency), y - 66, true, brand);
  y -= 92;

  // Notes
  if (s.sections.notes !== false && data.invoice.notes) {
    y -= 4;
    draw("NOTES", M, y, 8, bold, muted); y -= 12;
    const desc = safeText(data.invoice.notes);
    const words = desc.split(/\s+/);
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(test, 9.5) > W - M * 2) {
        draw(line, M, y, 9.5, font); y -= 12; line = w;
      } else line = test;
    }
    if (line) draw(line, M, y, 9.5, font);
  }

  // Footer
  if (s.sections.footer !== false) {
    page.drawLine({
      start: { x: M, y: 90 }, end: { x: W - M, y: 90 },
      thickness: 0.5, color: hair,
    });
    if (s.signature_name) draw(s.signature_name, M, 74, 10, bold);
    if (s.signature_title) draw(s.signature_title, M, 60, 9, font, muted);
    const foot = s.footer_text;
    const fw = font.widthOfTextAtSize(foot, 9);
    draw(foot, (W - fw) / 2, 34, 9, font, muted);
    if (s.company_website) {
      const ww = font.widthOfTextAtSize(s.company_website, 8.5);
      draw(s.company_website, W - M - ww, 34, 8.5, font, muted);
    }
  }

  return await pdf.save();
}
