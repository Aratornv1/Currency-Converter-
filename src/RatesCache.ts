import type { CurrencyCode } from './CurrencyCode';
import type { RatesSnapshot } from './RatesSnapshot';

interface Entry {
  snapshot: RatesSnapshot;
  expiresAt: number;
}

// Кеш знімків курсів у памʼяті. Кожен запис живе до свого expiresAt.
// Годинник (now) передається в конструктор, тому в тестах час можна «крутити» вручну.
export class RatesCache {
  readonly #entries = new Map<string, Entry>();

  constructor(private readonly now: () => number = Date.now) {}

  // Свіжий знімок або undefined, якщо запису немає чи він застарів
  getFresh(base: CurrencyCode): RatesSnapshot | undefined {
    const entry = this.#entries.get(base.value);
    return entry && entry.expiresAt > this.now() ? entry.snapshot : undefined;
  }

  // Знімок навіть застарілий: потрібен як запасний варіант, коли провайдер недоступний
  getStale(base: CurrencyCode): RatesSnapshot | undefined {
    return this.#entries.get(base.value)?.snapshot;
  }

  set(base: CurrencyCode, snapshot: RatesSnapshot, expiresAt: number): void {
    this.#entries.set(base.value, { snapshot, expiresAt });
  }
}
