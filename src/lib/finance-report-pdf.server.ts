// Server-side A4 financial report PDF (pdf-lib). Bangla-capable via an
// embedded Noto Sans Bengali subset, so client names / notes render correctly.
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
// fontkit's bundle uses regenerator helpers for complex-script (Bengali)
// shaping; the Worker runtime has no global for it, so provide one.
import regeneratorRuntime from "regenerator-runtime";
(globalThis as unknown as { regeneratorRuntime?: unknown }).regeneratorRuntime ??= regeneratorRuntime;
import fontkit from "@pdf-lib/fontkit";
import { NOTO_BENGALI_REGULAR_B64 } from "@/lib/fonts/noto-bengali-regular.server";
import { NOTO_BENGALI_BOLD_B64 } from "@/lib/fonts/noto-bengali-bold.server";
import { brandEmailList, BRAND_HOTLINE, embedBrandLogo, generatedByLine, type GeneratedBy } from "@/lib/brand/pdf-brand.server";

export type PdfReportRow = {
  date: string;
  type: "income" | "expense";
  reference: string;
  party: string;
  project: string;
  category: string;
  method: string;
  status: string;
  amount: number;
};

export type PdfReportInput = {
  title: string;
  subtitle?: string;
  periodLabel: string;
  generatedAt: string;
  currency: "BDT" | "USD";
  filters: string[];
  summary: { label: string; value: string }[];
  rows: PdfReportRow[];
  generatedBy?: GeneratedBy | null;
  company: { name: string; address?: string | null; email?: string | null; website?: string | null };
};

const A4 = { w: 595.28, h: 841.89 };
const M = 40;
const INK = rgb(0.09, 0.1, 0.12);
const MUTED = rgb(0.42, 0.45, 0.5);
const HAIR = rgb(0.85, 0.86, 0.88);
const BRAND = rgb(0.898, 0.416, 0.09);
const PANEL = rgb(0.976, 0.98, 0.984);
const POS = rgb(0.05, 0.5, 0.32);
const NEG = rgb(0.72, 0.16, 0.24);

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function money(n: number, cur: "BDT" | "USD") {
  const sym = cur === "BDT" ? "৳ " : "$ ";
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}${sym}${s}`;
}

function fit(text: string, font: PDFFont, size: number, max: number) {
  let t = (text ?? "").toString();
  if (!t) return "";
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "..", size) > max) t = t.slice(0, -1);
  return t + "..";
}

type Cols = { key: keyof PdfReportRow | "sl"; label: string; w: number; align?: "left" | "right" }[];

export async function buildFinanceReportPdf(input: PdfReportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(b64ToBytes(NOTO_BENGALI_REGULAR_B64), { subset: true });
  const bold = await pdf.embedFont(b64ToBytes(NOTO_BENGALI_BOLD_B64), { subset: true });
  const logo = await embedBrandLogo(pdf, "color");

  const contentW = A4.w - M * 2;
  const cols: Cols = [
    { key: "sl", label: "#", w: 28 },
    { key: "date", label: "Date", w: 52 },
    { key: "type", label: "Type", w: 40 },
    { key: "reference", label: "Reference", w: 62 },
    { key: "party", label: "Client / Vendor", w: 88 },
    { key: "project", label: "Project", w: 70 },
    { key: "category", label: "Category", w: 48 },
    { key: "method", label: "Method", w: 40 },
    { key: "amount", label: `Amount (${input.currency})`, w: contentW - (28 + 52 + 40 + 62 + 88 + 70 + 48 + 40), align: "right" },
  ];

  const pages: PDFPage[] = [];
  let page = pdf.addPage([A4.w, A4.h]);
  pages.push(page);
  let y = A4.h - M;

  const text = (
    s: string,
    x: number,
    yy: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxW?: number; align?: "left" | "right" } = {},
  ) => {
    const size = opts.size ?? 9;
    const f = opts.font ?? font;
    // The embedded Bengali font has no arrow glyph — keep it renderable.
    const safe = s.replace(/[→⟶]/g, "-").replace(/·/g, "|");
    const str = opts.maxW ? fit(safe, f, size, opts.maxW) : safe;
    const x2 = opts.align === "right" ? x - f.widthOfTextAtSize(str, size) : x;
    page.drawText(str, { x: x2, y: yy, size, font: f, color: opts.color ?? INK });
  };

  const drawHeader = () => {
    // Brand bar
    page.drawRectangle({ x: M, y: y - 4, width: contentW, height: 3, color: BRAND });
    y -= 30;
    if (logo) {
      const h = 26;
      const w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x: M, y: y - 6, width: w, height: h });
    }
    const metaRight = A4.w - M;
    text(input.title, metaRight, y + 10, { size: 12, font: bold, align: "right" });
    y -= 10;
    text(`Period: ${input.periodLabel}`, metaRight, y, { size: 8, color: MUTED, align: "right" });
    if (input.subtitle) text(input.subtitle, M, y, { size: 8, color: MUTED, maxW: contentW * 0.55 });
    y -= 14;
    page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.7, color: HAIR });
    y -= 16;
  };

  const drawTableHead = () => {
    page.drawRectangle({ x: M, y: y - 4, width: contentW, height: 18, color: PANEL });
    let x = M + 4;
    cols.forEach((c) => {
      text(c.label, c.align === "right" ? x + c.w - 8 : x, y + 1, {
        size: 7.5,
        font: bold,
        color: MUTED,
        align: c.align === "right" ? "right" : "left",
        maxW: c.w - 8,
      });
      x += c.w;
    });
    y -= 18;
  };

  const newPage = () => {
    page = pdf.addPage([A4.w, A4.h]);
    pages.push(page);
    y = A4.h - M;
    drawHeader();
    drawTableHead();
  };

  drawHeader();

  // Applied filters
  if (input.filters.length) {
    text("Applied filters", M, y, { size: 8, font: bold, color: MUTED });
    y -= 12;
    const line = input.filters.join("   |   ");
    // wrap
    const words = line.split(" ");
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(t, 8) > contentW) {
        text(cur, M, y, { size: 8, color: INK });
        y -= 11;
        cur = w;
      } else cur = t;
    }
    if (cur) {
      text(cur, M, y, { size: 8, color: INK });
      y -= 11;
    }
    y -= 6;
  }

  // Summary cards
  const cardW = (contentW - 8 * (input.summary.length - 1)) / Math.max(1, input.summary.length);
  const cardH = 40;
  input.summary.forEach((s, i) => {
    const x = M + i * (cardW + 8);
    page.drawRectangle({
      x, y: y - cardH, width: cardW, height: cardH,
      color: PANEL, borderColor: HAIR, borderWidth: 0.7,
    });
    text(s.label.toUpperCase(), x + 8, y - 15, { size: 6.8, color: MUTED, maxW: cardW - 16 });
    const negative = s.value.trim().startsWith("-");
    text(s.value, x + 8, y - 31, {
      size: 11,
      font: bold,
      color: /net/i.test(s.label) ? (negative ? NEG : POS) : INK,
      maxW: cardW - 16,
    });
  });
  y -= cardH + 18;

  drawTableHead();

  const rowH = 15;
  let total = 0;
  let income = 0;
  let expense = 0;

  input.rows.forEach((r, idx) => {
    if (y < M + 70) newPage();
    if (idx % 2 === 1) {
      page.drawRectangle({ x: M, y: y - 3, width: contentW, height: rowH, color: rgb(0.985, 0.987, 0.99) });
    }
    let x = M + 4;
    const signed = r.type === "expense" ? -Math.abs(r.amount) : Math.abs(r.amount);
    total += signed;
    if (r.type === "expense") expense += Math.abs(r.amount);
    else income += Math.abs(r.amount);

    cols.forEach((c) => {
      let v = "";
      if (c.key === "sl") v = String(idx + 1);
      else if (c.key === "amount") v = money(signed, input.currency);
      else v = String((r as unknown as Record<string, unknown>)[c.key] ?? "") || "—";
      text(v, c.align === "right" ? x + c.w - 8 : x, y + 1, {
        size: 7.6,
        maxW: c.w - 8,
        align: c.align === "right" ? "right" : "left",
        color: c.key === "amount" ? (signed < 0 ? NEG : POS) : INK,
        font: c.key === "amount" ? bold : font,
      });
      x += c.w;
    });
    y -= rowH;
  });

  if (!input.rows.length) {
    text("No transactions match the selected filters.", M + 4, y - 4, { size: 8.5, color: MUTED });
    y -= 20;
  } else {
    if (y < M + 70) newPage();
    y -= 4;
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: A4.w - M, y: y + 8 }, thickness: 0.7, color: HAIR });
    y -= 6;
    text(`Total income: ${money(income, input.currency)}    Total expense: ${money(expense, input.currency)}`, M + 4, y, {
      size: 8.5,
      color: MUTED,
    });
    text(`Net: ${money(total, input.currency)}`, A4.w - M - 4, y, {
      size: 10,
      font: bold,
      align: "right",
      color: total < 0 ? NEG : POS,
    });
    y -= 18;
  }

  // Footer on every page
  const stamp = generatedByLine(input.generatedBy).replace(/·/g, "|");
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M - 6 }, end: { x: A4.w - M, y: M - 6 }, thickness: 0.6, color: HAIR });
    p.drawText(fit(stamp, font, 7, contentW - 90), { x: M, y: M - 18, size: 7, font, color: MUTED });
    const contact = `Hotline: ${BRAND_HOTLINE}  |  ${brandEmailList(null)}  |  brantatech.com`;
    p.drawText(fit(contact, font, 6.8, contentW - 90), { x: M, y: M - 28, size: 6.8, font, color: MUTED });
    const lbl = `Page ${i + 1} of ${pages.length}`;
    p.drawText(lbl, {
      x: A4.w - M - font.widthOfTextAtSize(lbl, 7),
      y: M - 18,
      size: 7,
      font,
      color: MUTED,
    });
  });

  return await pdf.save();
}

/* ================= Generic tabular report (salary etc.) ================= */

export type GenericColumn = { label: string; w: number; align?: "left" | "right" };

export type GenericReportInput = {
  title: string;
  subtitle?: string;
  periodLabel: string;
  generatedAt: string;
  filters: string[];
  summary: { label: string; value: string }[];
  columns: GenericColumn[];
  rows: string[][];
  emptyText?: string;
  generatedBy?: GeneratedBy | null;
  company: { name: string; address?: string | null; email?: string | null; website?: string | null };
};

/**
 * Same A4 look as the finance report, but with caller-defined columns and
 * pre-formatted string cells. Used by the salary report export.
 */
export async function buildGenericReportPdf(input: GenericReportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(b64ToBytes(NOTO_BENGALI_REGULAR_B64), { subset: true });
  const bold = await pdf.embedFont(b64ToBytes(NOTO_BENGALI_BOLD_B64), { subset: true });
  const logo = await embedBrandLogo(pdf, "color");

  const contentW = A4.w - M * 2;
  const scale = contentW / input.columns.reduce((a, c) => a + c.w, 0);
  const cols = input.columns.map((c) => ({ ...c, w: c.w * scale }));

  const pages: PDFPage[] = [];
  let page = pdf.addPage([A4.w, A4.h]);
  pages.push(page);
  let y = A4.h - M;

  const text = (
    s: string,
    x: number,
    yy: number,
    opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxW?: number; align?: "left" | "right" } = {},
  ) => {
    const size = opts.size ?? 9;
    const f = opts.font ?? font;
    const safe = s.replace(/[→⟶]/g, "-").replace(/·/g, "|");
    const str = opts.maxW ? fit(safe, f, size, opts.maxW) : safe;
    const x2 = opts.align === "right" ? x - f.widthOfTextAtSize(str, size) : x;
    page.drawText(str, { x: x2, y: yy, size, font: f, color: opts.color ?? INK });
  };

  const drawHeader = () => {
    page.drawRectangle({ x: M, y: y - 4, width: contentW, height: 3, color: BRAND });
    y -= 30;
    if (logo) {
      const h = 26;
      const w = (logo.width / logo.height) * h;
      page.drawImage(logo, { x: M, y: y - 6, width: w, height: h });
    }
    const metaRight = A4.w - M;
    text(input.title, metaRight, y + 10, { size: 12, font: bold, align: "right" });
    y -= 10;
    text(`Period: ${input.periodLabel}`, metaRight, y, { size: 8, color: MUTED, align: "right" });
    if (input.subtitle) text(input.subtitle, M, y, { size: 8, color: MUTED, maxW: contentW * 0.55 });
    y -= 14;
    page.drawLine({ start: { x: M, y }, end: { x: A4.w - M, y }, thickness: 0.7, color: HAIR });
    y -= 16;
  };

  const drawTableHead = () => {
    page.drawRectangle({ x: M, y: y - 4, width: contentW, height: 18, color: PANEL });
    let x = M + 4;
    cols.forEach((c) => {
      text(c.label, c.align === "right" ? x + c.w - 8 : x, y + 1, {
        size: 7.5, font: bold, color: MUTED,
        align: c.align === "right" ? "right" : "left",
        maxW: c.w - 8,
      });
      x += c.w;
    });
    y -= 18;
  };

  const newPage = () => {
    page = pdf.addPage([A4.w, A4.h]);
    pages.push(page);
    y = A4.h - M;
    drawHeader();
    drawTableHead();
  };

  drawHeader();

  if (input.filters.length) {
    text("Applied filters", M, y, { size: 8, font: bold, color: MUTED });
    y -= 12;
    let cur = "";
    for (const w of input.filters.join("   |   ").split(" ")) {
      const t = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(t, 8) > contentW) { text(cur, M, y, { size: 8 }); y -= 11; cur = w; }
      else cur = t;
    }
    if (cur) { text(cur, M, y, { size: 8 }); y -= 11; }
    y -= 6;
  }

  if (input.summary.length) {
    const cardW = (contentW - 8 * (input.summary.length - 1)) / input.summary.length;
    const cardH = 40;
    input.summary.forEach((s, i) => {
      const x = M + i * (cardW + 8);
      page.drawRectangle({ x, y: y - cardH, width: cardW, height: cardH, color: PANEL, borderColor: HAIR, borderWidth: 0.7 });
      text(s.label.toUpperCase(), x + 8, y - 15, { size: 6.8, color: MUTED, maxW: cardW - 16 });
      text(s.value, x + 8, y - 31, { size: 11, font: bold, maxW: cardW - 16 });
    });
    y -= cardH + 18;
  }

  drawTableHead();

  const rowH = 15;
  input.rows.forEach((r, idx) => {
    if (y < M + 60) newPage();
    if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - 3, width: contentW, height: rowH, color: rgb(0.985, 0.987, 0.99) });
    let x = M + 4;
    cols.forEach((c, ci) => {
      const v = r[ci] ?? "";
      text(v || "—", c.align === "right" ? x + c.w - 8 : x, y + 1, {
        size: 7.6, maxW: c.w - 8,
        align: c.align === "right" ? "right" : "left",
        font: c.align === "right" ? bold : font,
      });
      x += c.w;
    });
    y -= rowH;
  });

  if (!input.rows.length) {
    text(input.emptyText ?? "No records match the selected filters.", M + 4, y - 4, { size: 8.5, color: MUTED });
  }

  const stamp = generatedByLine(input.generatedBy).replace(/·/g, "|");
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M - 6 }, end: { x: A4.w - M, y: M - 6 }, thickness: 0.6, color: HAIR });
    p.drawText(fit(stamp, font, 7, contentW - 90), { x: M, y: M - 18, size: 7, font, color: MUTED });
    const contact = `Hotline: ${BRAND_HOTLINE}  |  ${brandEmailList(null)}  |  brantatech.com`;
    p.drawText(fit(contact, font, 6.8, contentW - 90), { x: M, y: M - 28, size: 6.8, font, color: MUTED });
    const lbl = `Page ${i + 1} of ${pages.length}`;
    p.drawText(lbl, { x: A4.w - M - font.widthOfTextAtSize(lbl, 7), y: M - 18, size: 7, font, color: MUTED });
  });

  return await pdf.save();
}
