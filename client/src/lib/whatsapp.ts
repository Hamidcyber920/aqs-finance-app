/**
 * Formats a phone number for use in a wa.me URL.
 *
 * Rules applied (UK-centric):
 *  1. Strip all non-digit characters (spaces, dashes, brackets, +)
 *  2. If the number starts with "0"  → replace leading 0 with "44"
 *  3. If the number starts with "44" → keep as-is
 *  4. If the number is already an international number without a leading "+"
 *     (e.g. "447700900000") → keep as-is
 *  5. Any other number (e.g. already has country code but not 44) → keep as-is
 *
 * Returns the digits-only string ready to embed in https://wa.me/{number}
 */
export function formatWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return "44" + digits.slice(1);
  return digits;
}

/**
 * Builds a full wa.me URL with an optional pre-filled message.
 */
export function buildWhatsAppUrl(phone: string, message?: string): string {
  const number = formatWhatsAppNumber(phone);
  const base = number ? `https://wa.me/${number}` : "https://wa.me/";
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
