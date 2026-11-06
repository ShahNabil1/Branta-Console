/** Quote CSV fields and force spreadsheet formulas to remain literal text. */
export function walletCsvCell(value: unknown): string {
  let text = String(value ?? "");
  // Spreadsheet readers may ignore leading whitespace/control characters.
  if (typeof value === "string" && (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}