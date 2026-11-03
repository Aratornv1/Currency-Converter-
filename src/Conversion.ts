import type { Amount } from './Amount';
import type { CurrencyCode } from './CurrencyCode';
import { UnknownCurrencyError } from './errors';
import type { RatesSnapshot } from './RatesSnapshot';

// Результат конвертації. Створюється лише через Conversion.of, тож завжди узгоджений:
// результат точно дорівнює сумі × курс (з округленням).
export class Conversion {
  static of(snapshot: RatesSnapshot, to: CurrencyCode, amount: Amount): Conversion {
    const rate = snapshot.rateTo(to);
    if (rate === undefined) throw new UnknownCurrencyError(to.value);
    return new Conversion(snapshot.base.value, to.value, amount.value, rate, amount.times(rate), snapshot.updatedAt);
  }

  private constructor(
    readonly from: string,
    readonly to: string,
    readonly amount: number,
    readonly rate: number,
    readonly result: number,
    readonly updatedAt: string,
  ) {}

  // res.json(conversion) викликає цей метод сам: форма відповіді API визначена в одному місці
  toJSON() {
    return { from: this.from, to: this.to, amount: this.amount, rate: this.rate, result: this.result, updatedAt: this.updatedAt };
  }
}
