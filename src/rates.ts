import { config } from './config';

// Помилка з готовим HTTP-статусом: app.ts просто віддає її клієнту
export class RatesError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface RatesSnapshot {
  base: string;
  rates: Record<string, number>;
  updatedAt: string; // коли провайдер востаннє оновив курси (ISO, UTC)
}

export interface Conversion {
  from: string;
  to: string;
  amount: number;
  rate: number;
  result: number;
  updatedAt: string;
}

export interface RatesServiceOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch; // Dependency Injection: у тестах підставляємо підробку
  now?: () => number;
  fallbackTtlMs?: number;
}

interface CacheEntry {
  snapshot: RatesSnapshot;
  expiresAt: number;
}

// Factory: кожен виклик створює незалежний сервіс зі своїм кешем (тести беруть свій).
export function createRatesService(options: RatesServiceOptions = {}) {
  const baseUrl = options.baseUrl ?? config.ratesApiUrl;
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now;
  const fallbackTtlMs = options.fallbackTtlMs ?? config.ratesFallbackTtlSeconds * 1000;

  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<RatesSnapshot>>();

  async function download(base: string): Promise<RatesSnapshot> {
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}/${base}`, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw new RatesError('Exchange rate provider is unreachable', 502);
    }
    if (res.status === 429) throw new RatesError('Exchange rate provider rate limit reached, try again later', 502);
    if (res.status === 404) throw new RatesError(`Unknown currency: ${base}`, 404);

    let body: any;
    try {
      body = await res.json();
    } catch {
      throw new RatesError('Exchange rate provider returned invalid data', 502);
    }
    if (body?.['error-type'] === 'unsupported-code') throw new RatesError(`Unknown currency: ${base}`, 404);
    if (!res.ok || body?.result !== 'success' || typeof body.rates !== 'object' || body.rates === null) {
      throw new RatesError('Exchange rate provider returned an error', 502);
    }

    const nextUpdateMs = Number(body.time_next_update_unix) * 1000;
    const expiresAt = nextUpdateMs > now() ? nextUpdateMs : now() + fallbackTtlMs;
    const snapshot: RatesSnapshot = {
      base,
      rates: body.rates,
      updatedAt: new Date(Number(body.time_last_update_unix) * 1000).toISOString(),
    };
    cache.set(base, { snapshot, expiresAt });
    return snapshot;
  }

  async function getRates(base: string): Promise<RatesSnapshot> {
    const cached = cache.get(base);
    if (cached && cached.expiresAt > now()) return cached.snapshot;

    // Одночасні запити на ту саму валюту ділять один виклик до провайдера
    let pending = inFlight.get(base);
    if (!pending) {
      pending = download(base)
        .catch((err) => {
          // Провайдер недоступний, а старі курси є: краще віддати їх, ніж помилку
          if (cached && err instanceof RatesError && err.status === 502) return cached.snapshot;
          throw err;
        })
        .finally(() => inFlight.delete(base));
      inFlight.set(base, pending);
    }
    return pending;
  }

  async function listCurrencies(): Promise<string[]> {
    const { rates } = await getRates('USD');
    return Object.keys(rates).sort();
  }

  async function convert(from: string, to: string, amount: number): Promise<Conversion> {
    const { rates, updatedAt } = await getRates(from);
    const rate = rates[to];
    if (typeof rate !== 'number') throw new RatesError(`Unknown currency: ${to}`, 404);
    // 4 знаки після коми, щоб прибрати хвости плаваючої крапки (0.1 + 0.2)
    const result = Math.round(amount * rate * 1e4) / 1e4;
    return { from, to, amount, rate, result, updatedAt };
  }

  return { getRates, listCurrencies, convert };
}

export type RatesService = ReturnType<typeof createRatesService>;

// Singleton: один спільний сервіс (і кеш) на весь застосунок.
// Без цього кожен новий сервіс мав би порожній кеш і зайвий раз ходив би до API з лімітом.
let sharedService: RatesService | undefined;

export function getRatesService(): RatesService {
  sharedService ??= createRatesService();
  return sharedService;
}
