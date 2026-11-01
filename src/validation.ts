// Максимальна сума: більше за це float уже втрачає точність
export const MAX_AMOUNT = 1e12;

export type Parsed<T> = { ok: true; data: T } | { ok: false; error: string };

export function parseCurrencyCode(value: unknown, field: string): Parsed<string> {
  if (typeof value !== 'string') return { ok: false, error: `${field} is required` };
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return { ok: false, error: `${field} must be a 3-letter currency code` };
  return { ok: true, data: code };
}

export function parseAmount(value: unknown): Parsed<number> {
  if (typeof value !== 'string' || value.trim() === '') return { ok: false, error: 'amount is required' };
  // Number('1e3') = 1000, Number('0x10') = 16: приймаємо лише звичайний запис 12 або 12.5
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return { ok: false, error: 'amount must be a non-negative number' };
  const amount = Number(value);
  if (amount > MAX_AMOUNT) return { ok: false, error: `amount must not exceed ${MAX_AMOUNT}` };
  return { ok: true, data: amount };
}
