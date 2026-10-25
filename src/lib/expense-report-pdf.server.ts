// Dedicated audit-style Expense Report (A4 landscape, pdf-lib).
// Category summary → category-grouped detail with subtotals → grand total →
// sign-off block. Each voucher gets a clickable "Open" button to its public page.
import { PDFDocument, PDFName, PDFString, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import regeneratorRuntime from "regenerator-runtime";
(globalThis as unknown as { regeneratorRuntime?: unknown }).regeneratorRuntime ??= regeneratorRuntime;
import fontkit from "@pdf-lib/fontkit";
import { NOTO_BENGALI_REGULAR_B64 } from "@/lib/fonts/noto-bengali-regular.server";
import { NOTO_BENGALI_BOLD_B64 } from "@/lib/fonts/noto-bengali-bold.server";
import { brandEmailList, BRAND_HOTLINE, embedBrandLogo, generatedByLine, type GeneratedBy } from "@/lib/brand/pdf-brand.server";

export type ExpenseReportRow = {
  date: string;
  voucher: string;
  category: string; // display label
  vendor: string;
  department: string;
  requestedBy: string;
  paidBy: string;
  approvedBy: string;
  fund: string;
  project: string;
  purpose: string;
  items: string;
  method: string;
  txnId: string;
  sealed: boolean;
  publicUrl: string | null;
  receiptUrl: string | null;
  amount: number;
};

export type ExpenseReportInput = {
  periodLabel: string;
  generatedAt: string;
  currency: "BDT" | "USD";
  filters: string[];
  rows: ExpenseReportRow[];
  generatedBy?: GeneratedBy | null;
};

const PAGE = { w: 841.89, h: 595.28 };
const M = 32;
const INK = rgb(0.09, 0.1, 0.12);
const MUTED = rgb(0.42, 0.45, 0.5);
const HAIR = rgb(0.85, 0.86, 0.88);
const BRAND = rgb(0.898, 0.416, 0.09);
const BRAND_SOFT = rgb(0.995, 0.95, 0.92);
const PANEL = rgb(0.976, 0.98, 0.984);
const NEG = rgb(0.72, 0.16, 0.24);
const POS = rgb(0.05, 0.5, 0.32);

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function moneyFmt(n: number, cur: "BDT" | "USD") {
  const sym = cur === "BDT" ? "৳ " : "$ ";
  return `${n < 0 ? "-" : ""}${sym}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fit(text: string, font: PDFFont, size: number, max: number) {
  let t = (text ?? "").toString();
  if (!t) return "";
  if (font.widthOfTextAtSize(t, size) <= max) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "..", size) > max) t = t.slice(0, -1);
  return t + "..";
}

/** Group rows by category (largest total first) — exported for tests. */
export function groupByCategory(rows: ExpenseReportRow[]) {
  const map = new Map<string, ExpenseReportRow[]>();
  rows.forEach((r) => {
    const list = map.get(r.category) ?? [];
    list.push(r);
    map.set(r.category, list);
  });
  return Array.from(map.entries())
    .map(([category, list]) => ({
      category,
      rows: list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
      total: list.reduce((s, r) => s + Math.abs(r.amount), 0),
    }))
    .sort((a, b) => b.total - a.total);
}

export async function buildExpenseReportPdf(input: ExpenseReportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(b64ToBytes(NOTO_BENGALI_REGULAR_B64), { subset: true });
  const bold = await pdf.embedFont(b64ToBytes(NOTO_BENGALI_BOLD_B64), { subset: true });
  const logo = await embedBrandLogo(pdf, "color");
  const cur = input.currency;
  const money = (n: number) => moneyFmt(n, cur);
  const contentW = PAGE.w - M * 2;

  const groups = groupByCategory(input.rows);
  const grand = groups.reduce((s, g) => s + g.total, 0);
  const count = input.rows.length;

  const pages: PDFPage[] = [];
  let page = pdf.addPage([PAGE.w, PAGE.h]);
  pages.push(page);
  let y = PAGE.h - M;

  const text = (
    s: string, x: number, yy: number,
    o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxW?: number; align?: "left" | "right" | "center" } = {},
  ) => {
    const size = o.size ?? 8;
    const f = o.font ?? font;
    const safe = (s ?? "").replace(/[→⟶↗]/g, "-").replace(/·/g, "|").replace(/[\r\n]+/g, " ");
    const str = o.maxW ? fit(safe, f, size, o.maxW) : safe;
    const w = f.widthOfTextAtSize(str, size);
    const x2 = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    page.drawText(str, { x: x2, y: yy, size, font: f, color: o.color ?? INK });
  };

  const link = (x: number, yy: number, w: number, h: number, url: string) => {
    const annot = pdf.context.obj({
      Type: "Annot", Subtype: "Link", Rect: [x, yy, x + w, yy + h], Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    });
    const ref = pdf.context.register(annot);
    const existing = page.node.lookup(PDFName.of("Annots"));
    if (existing) (existing as unknown as { push: (r: unknown) => void }).push(ref);
    else page.node.set(PDFName.of("Annots"), pdf.context.obj([ref]));
  };

  const button = (label: string, x: number, yy: number, w: number, url: string, tone: "brand" | "muted" = "brand") => {
    const h = 11;
    page.drawRectangle({
      x, y: yy - 3, width: w, height: h,
      color: tone === "brand" ? BRAND_SOFT : PANEL,
      borderColor: tone === "brand" ? BRAND : HAIR, borderWidth: 0.6,
    });
    text(label, x + w / 2, yy - 0.2, { size: 6.4, font: bold, color: tone === "brand" ? BRAND : MUTED, align: "center" });
    link(x, yy - 3, w, h, url);
  };

  const drawHeader = (first: boolean) => {
    page.drawRectangle({ x: M, y: y - 3, width: contentW, height: 3, color: BRAND });
    y -= 28;
    if (logo) {
      const h = 24;
      page.drawImage(logo, { x: M, y: y - 4, width: (logo.width / logo.height) * h, height: h });
    }
    text("Expense Report", PAGE.w - M, y + 9, { size: first ? 14 : 11, font: bold, align: "right" });
    y -= 9;
    text(`Period: ${input.periodLabel}   |   Currency: ${cur}   |   Generated: ${input.generatedAt}`, PAGE.w - M, y, { size: 7.5, color: MUTED, align: "right" });
    y -= 12;
    page.drawLine({ start: { x: M, y }, end: { x: PAGE.w - M, y }, thickness: 0.7, color: HAIR });
    y -= 14;
  };

  // Detail columns (landscape).
  const cols: { key: string; label: string; w: number; align?: "right" | "center" }[] = [
    { key: "sl", label: "#", w: 20 },
    { key: "date", label: "Date", w: 50 },
    { key: "voucher", label: "Voucher", w: 66 },
    { key: "vendor", label: "Vendor / Payee", w: 76 },
    { key: "dept", label: "Department", w: 54 },
    { key: "people", label: "Requested / Paid / Approved", w: 104 },
    { key: "fund", label: "Fund / Project", w: 80 },
    { key: "purpose", label: "Purpose / Line items", w: 108 },
    { key: "method", label: "Method / TrxID", w: 70 },
    { key: "seal", label: "Seal", w: 40, align: "center" },
    { key: "link", label: "Link", w: 0, align: "center" },
    { key: "amount", label: `Amount (${cur})`, w: 66, align: "right" },
  ];
  const fixed = cols.reduce((s, c) => s + c.w, 0);
  cols.find((c) => c.key === "link")!.w = contentW - fixed;

  const drawTableHead = () => {
    page.drawRectangle({ x: M, y: y - 5, width: contentW, height: 16, color: PANEL });
    let x = M + 3;
    cols.forEach((c) => {
      const tx = c.align === "right" ? x + c.w - 6 : c.align === "center" ? x + c.w / 2 : x;
      text(c.label, tx, y, { size: 6.6, font: bold, color: MUTED, align: c.align, maxW: c.w - 6 });
      x += c.w;
    });
    y -= 17;
  };

  const newPage = (withHead = true) => {
    page = pdf.addPage([PAGE.w, PAGE.h]);
    pages.push(page);
    y = PAGE.h - M;
    drawHeader(false);
    if (withHead) drawTableHead();
  };
  const ensure = (h: number, withHead = true) => {
    if (y - h < M + 30) newPage(withHead);
  };

  drawHeader(true);

  if (input.filters.length) {
    text("Applied filters:", M, y, { size: 7.5, font: bold, color: MUTED });
    text(input.filters.join("   |   "), M + 62, y, { size: 7.5, maxW: contentW - 62 });
    y -= 14;
  }

  // KPI cards
  const top = groups[0];
  const sealedCount = input.rows.filter((r) => r.sealed).length;
  const kpis = [
    { label: "Total expense", value: money(grand), tone: NEG },
    { label: "Vouchers", value: String(count), tone: INK },
    { label: "Average per voucher", value: money(count ? grand / count : 0), tone: INK },
    { label: "Top category", value: top ? `${top.category}` : "—", tone: INK },
    { label: "Sealed vouchers", value: `${sealedCount} / ${count}`, tone: sealedCount === count && count ? POS : INK },
  ];
  const cardW = (contentW - 8 * (kpis.length - 1)) / kpis.length;
  kpis.forEach((k, i) => {
    const x = M + i * (cardW + 8);
    page.drawRectangle({ x, y: y - 38, width: cardW, height: 38, color: PANEL, borderColor: HAIR, borderWidth: 0.7 });
    text(k.label.toUpperCase(), x + 8, y - 13, { size: 6.5, color: MUTED, maxW: cardW - 16 });
    text(k.value, x + 8, y - 29, { size: 11, font: bold, color: k.tone, maxW: cardW - 16 });
  });
  y -= 52;

  // Category summary table
  text("SUMMARY BY CATEGORY", M, y, { size: 8, font: bold, color: BRAND });
  y -= 12;
  const sx = { name: M + 6, count: M + 300, amount: M + 470, pct: M + 540, bar: M + 560 };
  page.drawRectangle({ x: M, y: y - 5, width: contentW, height: 15, color: PANEL });
  text("Category", sx.name, y, { size: 6.8, font: bold, color: MUTED });
  text("Vouchers", sx.count, y, { size: 6.8, font: bold, color: MUTED, align: "right" });
  text(`Amount (${cur})`, sx.amount, y, { size: 6.8, font: bold, color: MUTED, align: "right" });
  text("Share", sx.pct, y, { size: 6.8, font: bold, color: MUTED, align: "right" });
  y -= 15;
  groups.forEach((g) => {
    ensure(14, false);
    const pct = grand ? (g.total / grand) * 100 : 0;
    text(g.category, sx.name, y, { size: 8 });
    text(String(g.rows.length), sx.count, y, { size: 8, align: "right" });
    text(money(g.total), sx.amount, y, { size: 8, font: bold, align: "right" });
    text(`${pct.toFixed(1)}%`, sx.pct, y, { size: 8, align: "right" });
    const barMax = PAGE.w - M - sx.bar - 6;
    page.drawRectangle({ x: sx.bar, y: y - 1, width: barMax, height: 6, color: PANEL });
    page.drawRectangle({ x: sx.bar, y: y - 1, width: Math.max(1, (barMax * pct) / 100), height: 6, color: BRAND });
    page.drawLine({ start: { x: M, y: y - 5 }, end: { x: PAGE.w - M, y: y - 5 }, thickness: 0.4, color: HAIR });
    y -= 14;
  });
  ensure(16, false);
  text("Grand total", sx.name, y - 2, { size: 8.5, font: bold });
  text(String(count), sx.count, y - 2, { size: 8.5, font: bold, align: "right" });
  text(money(grand), sx.amount, y - 2, { size: 8.5, font: bold, color: NEG, align: "right" });
  text(grand ? "100%" : "0%", sx.pct, y - 2, { size: 8.5, font: bold, align: "right" });
  y -= 24;

  if (!count) {
    text("No expenses match the selected period and filters.", M, y, { size: 9, color: MUTED });
    y -= 20;
  }

  // Detailed, grouped by category
  if (count) {
    ensure(60, false);
    text("DETAILED EXPENSES BY CATEGORY", M, y, { size: 8, font: bold, color: BRAND });
    y -= 14;
    drawTableHead();
  }
  const rowH = 22;
  let sl = 0;
  groups.forEach((g) => {
    ensure(18 + rowH);
    page.drawRectangle({ x: M, y: y - 5, width: contentW, height: 15, color: BRAND_SOFT });
    page.drawRectangle({ x: M, y: y - 5, width: 2.5, height: 15, color: BRAND });
    text(`${g.category}`, M + 8, y, { size: 8.5, font: bold });
    text(`${g.rows.length} voucher${g.rows.length === 1 ? "" : "s"}`, M + 8 + bold.widthOfTextAtSize(g.category, 8.5) + 10, y, { size: 7.2, color: MUTED });
    y -= 17;

    g.rows.forEach((r, i) => {
      ensure(rowH + 4);
      sl += 1;
      if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 13, width: contentW, height: rowH, color: rgb(0.988, 0.989, 0.992) });
      let x = M + 3;
      const line1 = y + 2;
      const line2 = y - 7.5;
      cols.forEach((c) => {
        const w = c.w - 6;
        const L = (s: string, yy = line1, o: Parameters<typeof text>[3] = {}) => text(s || "—", x, yy, { size: 7.2, maxW: w, ...o });
        const S = (s: string) => s && text(s, x, line2, { size: 6.4, maxW: w, color: MUTED });
        switch (c.key) {
          case "sl": L(String(sl), line1, { color: MUTED }); break;
          case "date": L(r.date); break;
          case "voucher": L(r.voucher, line1, { font: bold }); break;
          case "vendor": L(r.vendor); break;
          case "dept": L(r.department); break;
          case "people":
            L(`Req: ${r.requestedBy || "—"}`);
            S(`Paid: ${r.paidBy || "—"}  |  Appr: ${r.approvedBy || "—"}`);
            break;
          case "fund": L(r.fund); S(r.project && r.project !== "—" ? r.project : ""); break;
          case "purpose": L(r.purpose || r.items); S(r.purpose ? r.items : ""); break;
          case "method": L(r.method); S(r.txnId ? `TrxID ${r.txnId}` : ""); break;
          case "seal": {
            const lbl = r.sealed ? "Sealed" : "Unsealed";
            const bw = 30;
            page.drawRectangle({
              x: x + (c.w - bw) / 2 - 3, y: line1 - 3, width: bw, height: 10,
              color: r.sealed ? rgb(0.92, 0.97, 0.94) : PANEL,
              borderColor: r.sealed ? POS : HAIR, borderWidth: 0.5,
            });
            text(lbl, x + c.w / 2 - 3, line1 - 0.3, { size: 5.8, font: bold, color: r.sealed ? POS : MUTED, align: "center" });
            break;
          }
          case "link": {
            const bw = Math.min(42, c.w - 8);
            const bx = x + (c.w - bw) / 2 - 3;
            if (r.publicUrl) button("Open", bx, line1, bw, r.publicUrl, "brand");
            else text("Private", x + c.w / 2 - 3, line1, { size: 6.4, color: MUTED, align: "center" });
            if (r.receiptUrl) button("Receipt", bx, line2, bw, r.receiptUrl, "muted");
            break;
          }
          case "amount":
            text(money(-Math.abs(r.amount)), x + c.w - 6, line1, { size: 7.6, font: bold, color: NEG, align: "right" });
            break;
        }
        x += c.w;
      });
      y -= rowH;
    });

    ensure(18);
    page.drawLine({ start: { x: M, y: y + 7 }, end: { x: PAGE.w - M, y: y + 7 }, thickness: 0.6, color: HAIR });
    text(`Subtotal — ${g.category}`, PAGE.w - M - 110, y - 3, { size: 8, font: bold, align: "right" });
    text(money(g.total), PAGE.w - M - 3, y - 3, { size: 8.5, font: bold, color: NEG, align: "right" });
    y -= 20;
  });

  if (count) {
    ensure(30, false);
    page.drawRectangle({ x: M, y: y - 10, width: contentW, height: 22, color: INK });
    text("GRAND TOTAL EXPENSE", M + 10, y - 2, { size: 9.5, font: bold, color: rgb(1, 1, 1) });
    text(`${count} vouchers  |  ${groups.length} categories`, M + 140, y - 2, { size: 7.5, color: rgb(0.85, 0.86, 0.88) });
    text(money(grand), PAGE.w - M - 10, y - 2, { size: 11, font: bold, color: rgb(1, 1, 1), align: "right" });
    y -= 34;
  }

  // Sign-off block
  ensure(60, false);
  y -= 24;
  const sigW = (contentW - 40) / 3;
  ["Prepared by", "Checked by (Finance)", "Approved by (Director)"].forEach((lbl, i) => {
    const x = M + i * (sigW + 20);
    page.drawLine({ start: { x, y }, end: { x: x + sigW, y }, thickness: 0.6, color: INK });
    text(lbl, x, y - 11, { size: 7.5, color: MUTED });
  });
  y -= 20;

  const stamp = generatedByLine(input.generatedBy ?? null).replace(/·/g, "|");
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M - 6 }, end: { x: PAGE.w - M, y: M - 6 }, thickness: 0.6, color: HAIR });
    p.drawText(fit(stamp, font, 6.8, contentW - 90), { x: M, y: M - 16, size: 6.8, font, color: MUTED });
    const contact = `Hotline: ${BRAND_HOTLINE}  |  ${brandEmailList(null)}  |  brantatech.com  |  Confidential — internal finance document`;
    p.drawText(fit(contact, font, 6.5, contentW - 90), { x: M, y: M - 25, size: 6.5, font, color: MUTED });
    const lbl = `Page ${i + 1} of ${pages.length}`;
    p.drawText(lbl, { x: PAGE.w - M - font.widthOfTextAtSize(lbl, 7), y: M - 16, size: 7, font, color: MUTED });
  });

  return await pdf.save();
}
