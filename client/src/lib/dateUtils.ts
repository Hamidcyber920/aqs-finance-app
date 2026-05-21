/**
 * Shared date formatting utilities — all dates display as dd/mm/yyyy throughout the app.
 */

/**
 * Format a date value as dd/mm/yyyy.
 * Accepts Date objects, ISO strings, timestamps (number), or null/undefined.
 * Returns "—" for falsy values.
 */
export function fmtDate(value: Date | string | number | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Format a date value as dd/mm/yyyy HH:MM (24-hour).
 */
export function fmtDateTime(value: Date | string | number | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

/**
 * Convert an ISO date string (yyyy-mm-dd) to dd/mm/yyyy without timezone conversion.
 * Safe for date-only strings from <input type="date">.
 */
export function fmtIsoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
