import * as XLSX from "xlsx";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import {
  INCOME_HEADERS,
  EXPENSE_HEADERS,
  SUMMARY_HEADERS,
  MONTH_HEADERS,
  financeSummary,
  periodLabel,
  dateLabel,
  type FinanceExport,
} from "./finance-export";

const NUMBER_FORMAT = '#,##,##0.00;[Red](#,##,##0.00);"-"';
type Value = string | number | Date;
/** SheetJS creates the workbook; targeted OOXML adds formatting/frozen panes unsupported by CE. */
export function buildFinanceExcel(report: FinanceExport): Uint8Array {
  const book = XLSX.utils.book_new();
  const income = [...report.income].sort((a, b) => a.date.localeCompare(b.date));
  const expenses = [...report.expenses].sort((a, b) => a.date.localeCompare(b.date));
  const sum = financeSummary(report);
  const date = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
  const incRows: Value[][] = [
    INCOME_HEADERS,
    ...income.map((r, i) => [
      i + 1,
      date(r.date),
      r.transactionId,
      r.party,
      r.purpose,
      r.method,
      r.amount,
    ]),
    ["Total Income", "", "", "", "", "", sum.income],
  ];
  const expRows: Value[][] = [
    EXPENSE_HEADERS,
    ...expenses.map((r, i) => [i + 1, date(r.date), r.purpose, r.transactionId, r.amount]),
    ["Total Expense", "", "", "", sum.expense],
  ];
  const summaryRows: Value[][] = [
    SUMMARY_HEADERS,
    [periodLabel(report), sum.income, sum.expense, sum.net, sum.status],
    [],
    MONTH_HEADERS,
    ...sum.months.map((m) => [m.month, m.income, m.expense, m.net]),
  ];
  const sheets = [incRows, expRows, summaryRows].map((rows, i) => {
    const ws = XLSX.utils.aoa_to_sheet(rows, { dateNF: "dd/mm/yyyy" });
    ws["!cols"] = rows[0].map((_, c) => ({
      wch:
        rows.reduce((max, row) => {
          const v = row[c];
          const text =
            v instanceof Date
              ? dateLabel(v.toISOString())
              : typeof v === "number" && c > 0
                ? v.toLocaleString("en-IN", { minimumFractionDigits: 2 })
                : String(v ?? "");
          return Math.max(max, ...text.split("\n").map((s) => s.length));
        }, 12) + 2,
    }));
    for (const [key, cell] of Object.entries(ws)) {
      if (key.startsWith("!")) continue;
      if (cell.t === "n" && ((XLSX.utils.decode_cell(key).c > 0 && !/^B\d+$/.test(key)) || i === 2))
        cell.z = NUMBER_FORMAT;
      if (i < 2 && /^B\d+$/.test(key) && cell.t === "n") cell.z = "dd/mm/yyyy";
    }
    XLSX.utils.book_append_sheet(book, ws, ["Income", "Expenses", "Summary"][i]);
    return ws;
  });
  const incTotal = income.length + 2,
    expTotal = expenses.length + 2;
  sheets[0][`G${incTotal}`].f = income.length ? `SUM(G2:G${incTotal - 1})` : "0";
  sheets[1][`E${expTotal}`].f = expenses.length ? `SUM(E2:E${expTotal - 1})` : "0";
  for (const [cell, formula] of Object.entries({
    B2: `'Income'!G${incTotal}`,
    C2: `'Expenses'!E${expTotal}`,
    D2: "B2-C2",
    E2: 'IF(D2>0,"Profit",IF(D2<0,"Loss","Break-even"))',
  }))
    sheets[2][cell].f = formula;
  sum.months.forEach((m, index) => {
    const row = index + 5;
    const [year, month] = m.month.split("-").map(Number);
    for (const [cell, sheet, amountCol, last] of [
      [`B${row}`, "Income", "G", incTotal - 1],
      [`C${row}`, "Expenses", "E", expTotal - 1],
    ] as const) {
      sheets[2][cell].f =
        last < 2
          ? "0"
          : `SUMIFS('${sheet}'!${amountCol}2:${amountCol}${last},'${sheet}'!B2:B${last},">="&DATE(${year},${month},1),'${sheet}'!B2:B${last},"<"&DATE(${year},${month + 1},1))`;
    }
    sheets[2][`D${row}`].f = `B${row}-C${row}`;
  });
  const bytes = XLSX.write(book, {
    type: "array",
    bookType: "xlsx",
    cellStyles: true,
    compression: true,
  });
  const files = unzipSync(new Uint8Array(bytes));
  // Styles: normal, header, amount, date, bold total, bold total amount.
  files["xl/styles.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##,##0.00;[Red](#,##,##0.00);&quot;-&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment wrapText="1"/></xf><xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  );
  for (let i = 0; i < 3; i++) {
    const key = `xl/worksheets/sheet${i + 1}.xml`;
    let xml = strFromU8(files[key]);
    const view =
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>';
    xml = xml.includes("<sheetViews")
      ? xml.replace(/<sheetViews[\s\S]*?<\/sheetViews>/, view)
      : xml.replace(/(<dimension[^>]*\/>)/, `$1${view}`);
    xml = xml.replace(/<c\b([^>]*)>/g, (_, attrs: string) => {
      const ref = /r="([A-Z]+)(\d+)"/.exec(attrs);
      if (!ref) return `<c${attrs}>`;
      const col = ref[1],
        row = Number(ref[2]);
      const head = row === 1 || (i === 2 && row === 4);
      const total =
        (i === 0 && row === incTotal) || (i === 1 && row === expTotal) || (i === 2 && row === 2);
      const amount =
        (i === 0 && col === "G") ||
        (i === 1 && col === "E") ||
        (i === 2 && ["B", "C", "D"].includes(col) && row !== 4);
      const style = head ? 1 : total ? (amount ? 5 : 4) : i < 2 && col === "B" ? 3 : amount ? 2 : 0;
      return `<c${attrs.replace(/\s+s="\d+"/, "")} s="${style}">`;
    });
    files[key] = strToU8(xml);
  }
  return zipSync(files);
}
