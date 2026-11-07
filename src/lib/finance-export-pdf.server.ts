import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import regeneratorRuntime from "regenerator-runtime";
import { NOTO_BENGALI_REGULAR_B64 } from "@/lib/fonts/noto-bengali-regular.server";
import { NOTO_BENGALI_BOLD_B64 } from "@/lib/fonts/noto-bengali-bold.server";
import {
  INCOME_HEADERS,
  EXPENSE_HEADERS,
  SUMMARY_HEADERS,
  MONTH_HEADERS,
  dateLabel,
  moneyLabel,
  periodLabel,
  financeSummary,
  type FinanceExport,
} from "./finance-export";

const PALETTE = {
  ink: rgb(0.067, 0.094, 0.153),
  muted: rgb(0.42, 0.45, 0.5),
  header: rgb(0.898, 0.906, 0.922),
  line: rgb(0.898, 0.906, 0.922),
  loss: rgb(0.72, 0.16, 0.24),
};
const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
export async function buildFinanceExportPdf(report: FinanceExport): Promise<Uint8Array> {
  (globalThis as unknown as { regeneratorRuntime?: unknown }).regeneratorRuntime ??=
    regeneratorRuntime;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(decode(NOTO_BENGALI_REGULAR_B64), { subset: true });
  const bold = await doc.embedFont(decode(NOTO_BENGALI_BOLD_B64), { subset: true });
  doc.setTitle(`${report.companyName} - Finance Report`);
  let page: PDFPage = doc.addPage([595.28, 841.89]),
    y = 0;
  const margin = 30,
    width = 535.28,
    size = 8,
    lineHeight = 12;
  const wrap = (text: string, font: PDFFont, max: number) => {
    const lines: string[] = [];
    let line = "";
    for (const paragraph of text
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .split("\n")) {
      for (const word of paragraph.split(/\s+/)) {
        if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > max) {
          lines.push(line);
          line = "";
        }
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > max && line) {
            lines.push(line);
            line = "";
          }
          line += char;
        }
        line += " ";
      }
      lines.push(line.trimEnd());
      line = "";
    }
    return lines.length ? lines : [""];
  };
  let first = true;
  const newPage = (section: string) => {
    if (!first) page = doc.addPage([595.28, 841.89]);
    first = false;
    y = 800;
    page.drawText(report.companyName, { x: margin, y, size: 15, font: bold, color: PALETTE.ink });
    y -= 20;
    page.drawText(`Report Period: ${periodLabel(report)}`, {
      x: margin,
      y,
      size: 9,
      font: regular,
      color: PALETTE.muted,
    });
    y -= 25;
    page.drawText(section, { x: margin, y, size: 13, font: bold, color: PALETTE.ink });
    y -= 20;
  };
  const table = (
    section: string,
    headers: string[],
    widths: number[],
    rows: (string | number)[][],
    total?: (string | number)[],
  ) => {
    const drawRow = (values: (string | number)[], heading = false, strong = false) => {
      const font = heading || strong ? bold : regular;
      const mergedWidth = strong && total ? widths.slice(0, -1).reduce((a, b) => a + b, 0) : 0;
      const lines = values.map((v, i) =>
        wrap(
          typeof v === "number" ? moneyLabel(v) : v,
          font,
          i === 0 && mergedWidth ? mergedWidth - 10 : widths[i] - 10,
        ),
      );
      const height = Math.max(...lines.map((l) => l.length)) * lineHeight + 12;
      if (height > 640) throw new Error("A finance report entry is too long for an A4 page.");
      if (y - height < 48) {
        newPage(section);
        drawRow(headers, true);
      }
      if (heading)
        page.drawRectangle({ x: margin, y: y - height, width, height, color: PALETTE.header });
      let x = margin;
      lines.forEach((parts, i) => {
        parts.forEach((text, index) => {
          const right = typeof values[i] === "number" && i > 0;
          page.drawText(text, {
            x: right ? x + widths[i] - 5 - font.widthOfTextAtSize(text, size) : x + 5,
            y: y - 11 - index * lineHeight,
            size,
            font,
            color:
              typeof values[i] === "number" && Number(values[i]) < 0 ? PALETTE.loss : PALETTE.ink,
          });
        });
        x += widths[i];
      });
      y -= height;
      page.drawLine({
        start: { x: margin, y },
        end: { x: margin + width, y },
        thickness: 0.4,
        color: PALETTE.line,
      });
    };
    drawRow(headers, true);
    rows.forEach((r) => drawRow(r));
    if (total) drawRow(total, false, true);
    y -= 20;
  };
  const sum = financeSummary(report);
  newPage("Income");
  table(
    "Income",
    INCOME_HEADERS,
    [24, 58, 77, 100, 113, 78, 85.28],
    [...report.income]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r, i) => [
        String(i + 1),
        dateLabel(r.date),
        r.transactionId,
        r.party,
        r.purpose,
        r.method,
        r.amount,
      ]),
    ["Total Income", "", "", "", "", "", sum.income],
  );
  newPage("Expenses");
  table(
    "Expenses",
    EXPENSE_HEADERS,
    [24, 65, 265, 96, 85.28],
    [...report.expenses]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r, i) => [String(i + 1), dateLabel(r.date), r.purpose, r.transactionId, r.amount]),
    ["Total Expense", "", "", "", sum.expense],
  );
  newPage("Summary");
  table(
    "Summary",
    SUMMARY_HEADERS,
    [145, 95, 95, 115, 85.28],
    [[periodLabel(report), sum.income, sum.expense, sum.net, sum.status]],
  );
  table(
    "Summary",
    MONTH_HEADERS,
    [175, 120, 120, 120.28],
    sum.months.map((m) => [m.month, m.income, m.expense, m.net]),
  );
  const pages = doc.getPages();
  pages.forEach((p, i) =>
    p.drawText(`Page ${i + 1} of ${pages.length}`, {
      x: margin,
      y: 25,
      size: 8,
      font: regular,
      color: PALETTE.muted,
    }),
  );
  return doc.save();
}
