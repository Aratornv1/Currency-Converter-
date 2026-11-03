import { ValidationError } from './errors';

// Сума до конвертації. Value object: правильна за побудовою (невідʼємне число не більше MAX).
export class Amount {
  // Більше за це float уже втрачає точність
  static readonly MAX = 1e12;

  static parse(value: unknown): Amount {
    if (typeof value !== 'string' || value.trim() === '') throw new ValidationError('amount is required');
    // Number('1e3') = 1000, Number('0x10') = 16: приймаємо лише звичайний запис 12 або 12.5
    if (!/^\d+(\.\d+)?$/.test(value.trim())) throw new ValidationError('amount must be a non-negative number');
    const amount = Number(value);
    if (amount > Amount.MAX) throw new ValidationError(`amount must not exceed ${Amount.MAX}`);
    return new Amount(amount);
  }

  private constructor(readonly value: number) {}

  // Множення на курс із округленням до 4 знаків, щоб прибрати хвости плаваючої крапки (0.1 + 0.2)
  times(rate: number): number {
    return Math.round(this.value * rate * 1e4) / 1e4;
  }
}
