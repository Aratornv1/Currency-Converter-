import { Amount } from './Amount';
import { AppConfig } from './AppConfig';
import { Conversion } from './Conversion';
import { CurrencyCode } from './CurrencyCode';
import { ExchangeRateApiProvider } from './ExchangeRateApiProvider';
import { ProviderError } from './errors';
import type { RatesProvider } from './RatesProvider';
import { RatesCache } from './RatesCache';
import type { RatesSnapshot } from './RatesSnapshot';

export interface RatesServiceOptions {
  config?: AppConfig;
  baseUrl?: string;
  fetchFn?: typeof fetch; // Dependency Injection: у тестах підставляємо підробку
  now?: () => number;
  fallbackTtlMs?: number;
}

// Сервіс курсів: бере знімки в провайдера, кешує їх і конвертує суми.
// Залежності (provider, cache) приходять у конструктор, тож сервіс не знає, звідки курси і де вони лежать.
export class RatesService {
  readonly #inFlight = new Map<string, Promise<RatesSnapshot>>();

  constructor(
    private readonly provider: RatesProvider,
    private readonly cache: RatesCache,
  ) {}

  // ── Factory: щоразу новий сервіс зі своїм кешем (зручно для тестів) ──
  static create(options: RatesServiceOptions = {}): RatesService {
    const config = options.config ?? AppConfig.defaults();
    const now = options.now ?? Date.now;
    const provider = new ExchangeRateApiProvider({
      baseUrl: options.baseUrl ?? config.ratesApiUrl,
      fetchFn: options.fetchFn ?? fetch,
      now,
      fallbackTtlMs: options.fallbackTtlMs ?? config.ratesFallbackTtlMs,
    });
    return new RatesService(provider, new RatesCache(now));
  }

  // ── Singleton: один спільний сервіс (і кеш) на весь застосунок ──
  // Без цього кожен новий сервіс мав би порожній кеш і зайвий раз ходив би до API з лімітом.
  static #shared: RatesService | undefined;

  static shared(): RatesService {
    RatesService.#shared ??= RatesService.create({ config: AppConfig.load() });
    return RatesService.#shared;
  }

  async getRates(base: CurrencyCode): Promise<RatesSnapshot> {
    const fresh = this.cache.getFresh(base);
    if (fresh) return fresh;

    // Одночасні запити на ту саму валюту ділять один виклик до провайдера
    let pending = this.#inFlight.get(base.value);
    if (!pending) {
      pending = this.refresh(base).finally(() => this.#inFlight.delete(base.value));
      this.#inFlight.set(base.value, pending);
    }
    return pending;
  }

  async listCurrencies(): Promise<string[]> {
    return (await this.getRates(CurrencyCode.of('USD'))).currencies();
  }

  async convert(from: CurrencyCode, to: CurrencyCode, amount: Amount): Promise<Conversion> {
    return Conversion.of(await this.getRates(from), to, amount);
  }

  private async refresh(base: CurrencyCode): Promise<RatesSnapshot> {
    try {
      const { snapshot, expiresAt } = await this.provider.fetchRates(base);
      this.cache.set(base, snapshot, expiresAt);
      return snapshot;
    } catch (err) {
      // Провайдер недоступний, а старі курси є: краще віддати їх, ніж помилку.
      // Помилку «такої валюти немає» (404) не підміняємо: вона правдива.
      const stale = this.cache.getStale(base);
      if (stale && err instanceof ProviderError) return stale;
      throw err;
    }
  }
}
