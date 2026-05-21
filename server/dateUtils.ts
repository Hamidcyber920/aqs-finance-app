/**
 * Server-side date formatting utilities — all dates display as dd/mm/yyyy.
 */

/**
 * Format a date value as dd/mm/yyyy.
 */
export function fmtDate(value: Date | string | number | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value as any);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Format a date value as dd/mm/yyyy HH:MM.
 */
export function fmtDateTime(value: Date | string | number | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value as any);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

/**
 * Format a date value as "20 May 2026" (long human-readable).
 */
export function fmtDateLong(value: Date | string | number | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value as any);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}
