import type { CurrencyCode } from './CurrencyCode';
import { ProviderError, UnknownCurrencyError } from './errors';
import type { ProviderRates, RatesProvider } from './RatesProvider';
import { RatesSnapshot } from './RatesSnapshot';

export interface ExchangeRateApiOptions {
  baseUrl: string;
  fallbackTtlMs: number; // на скільки вважати курси свіжими, якщо API не підказало час наступного оновлення
  fetchFn?: typeof fetch; // Dependency Injection: у тестах підставляємо підробку
  now?: () => number;
  timeoutMs?: number;
}

// Реалізація RatesProvider для ExchangeRate-API (open access). Єдине місце, що знає формат цього API:
// адресу, поля відповіді й те, як його статуси перетворюються на наші помилки.
export class ExchangeRateApiProvider implements RatesProvider {
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  constructor(private readonly options: ExchangeRateApiOptions) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 8000;
  }

  async fetchRates(base: CurrencyCode): Promise<ProviderRates> {
    const res = await this.request(base);
    const body = await this.readBody(res, base);
    return this.toProviderRates(base, body);
  }

  private async request(base: CurrencyCode): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.options.baseUrl}/${base}`, { signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new ProviderError('Exchange rate provider is unreachable');
    }
    if (res.status === 429) throw new ProviderError('Exchange rate provider rate limit reached, try again later');
    if (res.status === 404) throw new UnknownCurrencyError(base.value);
    return res;
  }

  // Тіло відповіді має «довільну» форму (any): перевіряємо його вручну, перш ніж довіряти
  private async readBody(res: Response, base: CurrencyCode): Promise<any> {
    let body: any;
    try {
      body = await res.json();
    } catch {
      throw new ProviderError('Exchange rate provider returned invalid data');
    }
    if (body?.['error-type'] === 'unsupported-code') throw new UnknownCurrencyError(base.value);
    if (!res.ok || body?.result !== 'success' || typeof body.rates !== 'object' || body.rates === null) {
      throw new ProviderError('Exchange rate provider returned an error');
    }
    return body;
  }

  private toProviderRates(base: CurrencyCode, body: any): ProviderRates {
    const nextUpdateMs = Number(body.time_next_update_unix) * 1000;
    const expiresAt = nextUpdateMs > this.now() ? nextUpdateMs : this.now() + this.options.fallbackTtlMs;
    const updatedAt = new Date(Number(body.time_last_update_unix) * 1000).toISOString();
    return { snapshot: new RatesSnapshot(base, body.rates, updatedAt), expiresAt };
  }
}
