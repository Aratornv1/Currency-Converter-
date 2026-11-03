import type { CurrencyCode } from './CurrencyCode';

// Знімок курсів однієї базової валюти на момент оновлення провайдером.
// Знає лише про себе: які валюти в ньому є і який курс до кожної.
export class RatesSnapshot {
  constructor(
    readonly base: CurrencyCode,
    private readonly rates: Readonly<Record<string, number>>,
    readonly updatedAt: string, // коли провайдер востаннє оновив курси (ISO, UTC)
  ) {}

  // Коди валют за абеткою
  currencies(): string[] {
    return Object.keys(this.rates).sort();
  }

  // Курс до валюти або undefined, якщо такої немає у знімку
  rateTo(code: CurrencyCode): number | undefined {
    const rate = this.rates[code.value];
    return typeof rate === 'number' ? rate : undefined;
  }
}
