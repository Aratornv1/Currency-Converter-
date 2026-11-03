import { ValidationError } from './errors';

// Код валюти (USD, UAH…). Value object: створити його можна лише через parse, а parse
// пропускає тільки 3 великі латинські літери. Тож якщо в руках є CurrencyCode, він правильний.
export class CurrencyCode {
  // field — назва параметра запиту, щоб повідомлення було точним («from is required»)
  static parse(value: unknown, field: string): CurrencyCode {
    if (typeof value !== 'string') throw new ValidationError(`${field} is required`);
    const code = value.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) throw new ValidationError(`${field} must be a 3-letter currency code`);
    return new CurrencyCode(code);
  }

  // Для внутрішнього коду, де відомо, що значення правильне (наприклад, базова валюта USD)
  static of(code: string): CurrencyCode {
    return CurrencyCode.parse(code, 'code');
  }

  private constructor(readonly value: string) {}

  equals(other: CurrencyCode): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
