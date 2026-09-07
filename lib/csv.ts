/**
 * csv.ts — export what you own, so it is yours to leave with.
 *
 * A collection someone has spent months entering should not be trapped in one
 * site. Exporting it is cheap to build and it is the thing that makes people
 * comfortable entering data in the first place.
 *
 * Escaping matters more than it looks: card names routinely contain commas
 * ("Jinnie Fay, Jetmir's Second") and quotes, and a naive join produces a file
 * that silently misaligns every column after the first bad row.
 */

/** Quote a field per RFC 4180 — double the quotes, wrap if it needs it. */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvField).join(",")];
  for (const row of rows) lines.push(row.map(csvField).join(","));
  // CRLF, because Excel is the most likely destination and it is the one tool
  // that still cares.
  return lines.join("\r\n") + "\r\n";
}

/**
 * Trigger a download in the browser.
 *
 * Uses a blob URL rather than a data: URI so a large collection does not hit
 * the URL length ceiling, and revokes it afterwards.
 */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined") return;
  // The BOM makes Excel read it as UTF-8 rather than mangling accented names.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
