// Minimal, dependency-light OOXML (.xlsx) writer.
// Produces a real spreadsheet (not a renamed CSV): sized columns, bold header
// row, real date cells and numeric cells with a currency-ish number format.
import { zipSync, strToU8 } from "fflate";

export type XlsxColumnType = "text" | "number" | "date";

export type XlsxColumn = {
  header: string;
  width?: number;
  type?: XlsxColumnType;
};

export type XlsxCell = string | number | null | undefined;

export type XlsxSheet = {
  name: string;
  columns: XlsxColumn[];
  rows: XlsxCell[][];
  /** Free-form lines rendered above the table (title, period, filters). */
  preamble?: string[];
  /** Bold summary row appended after the table. */
  totals?: XlsxCell[];
};

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // strip control chars Excel rejects
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const colName = (i: number) => {
  let s = "";
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
};

/** Excel serial date (1900 system) from an ISO yyyy-mm-dd string. */
function excelSerial(isoDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.floor(utc / 86400000) + 25569;
}

// Style indices used below:
// 0 default · 1 bold · 2 header (bold + fill + border) · 3 date · 4 number · 5 bold number
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="dd-mmm-yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
</styleSheet>`;

function cellXml(ref: string, value: XlsxCell, type: XlsxColumnType, style?: number) {
  if (value === null || value === undefined || value === "") return `<c r="${ref}"${style ? ` s="${style}"` : ""}/>`;
  if (type === "number" && typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}" s="${style ?? 4}"><v>${value}</v></c>`;
  }
  if (type === "date" && typeof value === "string") {
    const serial = excelSerial(value);
    if (serial != null) return `<c r="${ref}" s="${style ?? 3}"><v>${serial}</v></c>`;
  }
  return `<c r="${ref}"${style ? ` s="${style}"` : ""} t="inlineStr"><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet) {
  const cols = sheet.columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`)
    .join("");

  const rowsXml: string[] = [];
  let r = 1;

  for (const line of sheet.preamble ?? []) {
    rowsXml.push(`<row r="${r}">${cellXml(`A${r}`, line, "text", r === 1 ? 1 : 0)}</row>`);
    r += 1;
  }
  if ((sheet.preamble ?? []).length) {
    r += 1; // blank spacer row
  }

  const headerRow = sheet.columns
    .map((c, i) => cellXml(`${colName(i)}${r}`, c.header, "text", 2))
    .join("");
  rowsXml.push(`<row r="${r}">${headerRow}</row>`);
  const headerRowIndex = r;
  r += 1;

  for (const row of sheet.rows) {
    const cells = sheet.columns
      .map((c, i) => cellXml(`${colName(i)}${r}`, row[i], c.type ?? "text"))
      .join("");
    rowsXml.push(`<row r="${r}">${cells}</row>`);
    r += 1;
  }

  if (sheet.totals) {
    const cells = sheet.columns
      .map((c, i) =>
        cellXml(
          `${colName(i)}${r}`,
          sheet.totals?.[i],
          c.type ?? "text",
          (c.type ?? "text") === "number" ? 5 : 1,
        ),
      )
      .join("");
    rowsXml.push(`<row r="${r}">${cells}</row>`);
    r += 1;
  }

  const lastCol = colName(Math.max(0, sheet.columns.length - 1));
  const autoFilter = sheet.rows.length
    ? `<autoFilter ref="A${headerRowIndex}:${lastCol}${headerRowIndex + sheet.rows.length}"/>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${rowsXml.join("")}</sheetData>${autoFilter}</worksheet>`;
}

export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  const list = sheets.length ? sheets : [{ name: "Sheet1", columns: [], rows: [] }];
  const files: Record<string, Uint8Array> = {};

  files["[Content_Types].xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${list
  .map(
    (_s, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  )
  .join("")}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
  );

  files["_rels/.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );

  files["xl/workbook.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${list
      .map(
        (s, i) =>
          `<sheet name="${esc(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
      )
      .join("")}</sheets></workbook>`,
  );

  files["xl/_rels/workbook.xml.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
      .map(
        (_s, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("")}<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );

  files["xl/styles.xml"] = strToU8(STYLES_XML);
  list.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });

  return zipSync(files, { level: 6 });
}

/** RFC-4180 CSV with a UTF-8 BOM so Excel opens Bangla text correctly. */
export function buildCsv(headers: string[], rows: XlsxCell[][], preamble: string[] = []) {
  const cell = (v: XlsxCell) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    // Neutralize spreadsheet formula injection: text cells beginning with
    // = + - @ tab or CR are prefixed with ' (plain numbers are left intact).
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^[-+]?[\d,]*\.?\d+$/.test(s)) {
      s = `'${s}`;
    }
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[] = [];
  preamble.forEach((p) => lines.push(cell(p)));
  if (preamble.length) lines.push("");
  lines.push(headers.map(cell).join(","));
  rows.forEach((r) => lines.push(r.map(cell).join(",")));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
