/**
 * CSV for the admin's export. A cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return would be
 * run as a formula by a spreadsheet, and the cells are text a stranger typed: such a cell is prefixed with an
 * apostrophe, the usual defence.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
