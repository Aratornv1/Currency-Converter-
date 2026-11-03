// Тести RatesService (з провайдером ExchangeRateApiProvider усередині) і самого провайдера. Мережа не потрібна.
import { describe, expect, it, vi } from 'vitest';
import { Amount } from '../src/Amount';
import { CurrencyCode } from '../src/CurrencyCode';
import { ExchangeRateApiProvider } from '../src/ExchangeRateApiProvider';
import { ProviderError, UnknownCurrencyError } from '../src/errors';
import type { ProviderRates, RatesProvider } from '../src/RatesProvider';
import { RatesCache } from '../src/RatesCache';
import { RatesService } from '../src/RatesService';
import { RatesSnapshot } from '../src/RatesSnapshot';
import { fakeFetch, jsonResponse, ratesBody } from './helpers';

const usd = ratesBody('USD', { USD: 1, EUR: 0.9, UAH: 40, JPY: 150 });
const eur = ratesBody('EUR', { EUR: 1, USD: 1.1111, UAH: 44.4444 });

const code = (value: string) => CurrencyCode.of(value);
const amount = (value: string) => Amount.parse(value);
const convert = (service: RatesService, from: string, to: string, value = '1') =>
  service.convert(code(from), code(to), amount(value));

describe('convert', () => {
  it('множить суму на курс і округлює до 4 знаків', async () => {
    const service = RatesService.create({ fetchFn: fakeFetch({ USD: usd }) });
    const result = await convert(service, 'USD', 'UAH', '12.5');
    expect(result).toMatchObject({ from: 'USD', to: 'UAH', amount: 12.5, rate: 40, result: 500 });
    expect(result.updatedAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  it('прибирає хвости плаваючої крапки', async () => {
    const body = ratesBody('USD', { USD: 1, AAA: 0.1 });
    const service = RatesService.create({ fetchFn: fakeFetch({ USD: body }) });
    expect((await convert(service, 'USD', 'AAA', '3')).result).toBe(0.3); // 3 * 0.1 = 0.30000000000000004
  });

  it('сума 0 дає 0', async () => {
    const service = RatesService.create({ fetchFn: fakeFetch({ USD: usd }) });
    expect((await convert(service, 'USD', 'EUR', '0')).result).toBe(0);
  });

  it('невідома цільова валюта дає UnknownCurrencyError (404)', async () => {
    const service = RatesService.create({ fetchFn: fakeFetch({ USD: usd }) });
    const err = await convert(service, 'USD', 'XXX').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnknownCurrencyError);
    expect(err).toMatchObject({ status: 404, message: 'Unknown currency: XXX' });
  });

  it('невідома вихідна валюта дає 404', async () => {
    const service = RatesService.create({ fetchFn: fakeFetch({ USD: usd }) });
    await expect(convert(service, 'XXX', 'USD')).rejects.toMatchObject({ status: 404 });
  });
});

describe('listCurrencies', () => {
  it('повертає коди за абеткою', async () => {
    const service = RatesService.create({ fetchFn: fakeFetch({ USD: usd }) });
    expect(await service.listCurrencies()).toEqual(['EUR', 'JPY', 'UAH', 'USD']);
  });
});

describe('кеш', () => {
  it('другий запит на ту саму валюту не йде до провайдера', async () => {
    const fetchFn = fakeFetch({ USD: usd });
    const service = RatesService.create({ fetchFn });
    await convert(service, 'USD', 'EUR');
    await convert(service, 'USD', 'UAH');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('кожна базова валюта кешується окремо', async () => {
    const fetchFn = fakeFetch({ USD: usd, EUR: eur });
    const service = RatesService.create({ fetchFn });
    await convert(service, 'USD', 'EUR');
    await convert(service, 'EUR', 'USD');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('одночасні запити ділять один виклик до провайдера', async () => {
    const fetchFn = fakeFetch({ USD: usd });
    const service = RatesService.create({ fetchFn });
    await Promise.all([convert(service, 'USD', 'EUR'), convert(service, 'USD', 'UAH'), service.listCurrencies()]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('після часу наступного оновлення курси завантажуються знову', async () => {
    let time = 1_000_000; // now() у мілісекундах: зараз 1000 с
    const fetchFn = fakeFetch({ USD: ratesBody('USD', { USD: 1, EUR: 0.9 }, 1_000 + 60) }); // оновлення за 60 с
    const service = RatesService.create({ fetchFn, now: () => time });
    await convert(service, 'USD', 'EUR');
    time = 1_000_000 + 30_000; // ще не час
    await convert(service, 'USD', 'EUR');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    time = 1_000_000 + 61_000; // час минув
    await convert(service, 'USD', 'EUR');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('якщо час наступного оновлення вже минув, використовує запасний TTL', async () => {
    let time = 5_000_000;
    const fetchFn = fakeFetch({ USD: ratesBody('USD', { USD: 1, EUR: 0.9 }, 1) }); // 1970 рік
    const service = RatesService.create({ fetchFn, now: () => time, fallbackTtlMs: 10_000 });
    await convert(service, 'USD', 'EUR');
    time += 5_000;
    await convert(service, 'USD', 'EUR');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    time += 6_000;
    await convert(service, 'USD', 'EUR');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('якщо провайдер недоступний, віддає застарілі курси', async () => {
    let time = 5_000_000;
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse(ratesBody('USD', { USD: 1, EUR: 0.9 }, 1)))
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const service = RatesService.create({ fetchFn, now: () => time, fallbackTtlMs: 1_000 });
    await convert(service, 'USD', 'EUR');
    time += 2_000; // кеш протух
    expect((await convert(service, 'USD', 'EUR', '10')).result).toBe(9);
  });

  it('помилку 404 не підміняє застарілими даними і не кешує її', async () => {
    const fetchFn = fakeFetch({});
    const service = RatesService.create({ fetchFn });
    await expect(convert(service, 'XXX', 'USD')).rejects.toMatchObject({ status: 404 });
    await expect(convert(service, 'XXX', 'USD')).rejects.toMatchObject({ status: 404 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('помилки провайдера', () => {
  const failing = (response: Response | Error) =>
    RatesService.create({
      fetchFn: (response instanceof Error
        ? vi.fn().mockRejectedValue(response)
        : vi.fn().mockResolvedValue(response)) as unknown as typeof fetch,
    });

  it('мережева помилка дає ProviderError (502)', async () => {
    const err = await convert(failing(new Error('boom')), 'USD', 'EUR').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ status: 502 });
  });

  it('429 дає 502 з поясненням', async () => {
    const err = await convert(failing(jsonResponse({}, 429)), 'USD', 'EUR').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ status: 502, message: expect.stringContaining('rate limit') });
  });

  it('не-JSON відповідь дає 502', async () => {
    await expect(convert(failing(new Response('<html>', { status: 200 })), 'USD', 'EUR')).rejects.toMatchObject({ status: 502 });
  });

  it('result не success дає 502', async () => {
    await expect(convert(failing(jsonResponse({ result: 'error' })), 'USD', 'EUR')).rejects.toMatchObject({ status: 502 });
  });
});

describe('RatesService і RatesProvider (залежність від інтерфейсу)', () => {
  // Власний провайдер без жодного fetch: доводить, що сервіс залежить лише від інтерфейсу RatesProvider
  class StaticProvider implements RatesProvider {
    calls = 0;
    async fetchRates(base: CurrencyCode): Promise<ProviderRates> {
      this.calls++;
      return { snapshot: new RatesSnapshot(base, { USD: 1, PLN: 4 }, '2026-01-01T00:00:00.000Z'), expiresAt: Date.now() + 60_000 };
    }
  }

  it('працює з будь-яким провайдером і кешує його відповіді', async () => {
    const provider = new StaticProvider();
    const service = new RatesService(provider, new RatesCache());
    expect((await convert(service, 'USD', 'PLN', '2')).result).toBe(8);
    await convert(service, 'USD', 'PLN');
    expect(provider.calls).toBe(1);
  });
});

describe('ExchangeRateApiProvider', () => {
  const provider = (fetchFn: typeof fetch, now = () => 1_000_000) =>
    new ExchangeRateApiProvider({ baseUrl: 'https://api.test/latest', fetchFn, now, fallbackTtlMs: 5_000 });

  it('запитує <baseUrl>/<код> і повертає знімок та час закінчення з відповіді API', async () => {
    const fetchFn = fakeFetch({ USD: usd });
    const { snapshot, expiresAt } = await provider(fetchFn).fetchRates(code('USD'));
    expect(String(fetchFn.mock.calls[0]![0])).toBe('https://api.test/latest/USD');
    expect(snapshot.base.value).toBe('USD');
    expect(snapshot.rateTo(code('UAH'))).toBe(40);
    expect(expiresAt).toBe(2_000_000_000 * 1000); // time_next_update_unix у мілісекундах
  });

  it('якщо час наступного оновлення в минулому, додає запасний TTL до now()', async () => {
    const fetchFn = fakeFetch({ USD: ratesBody('USD', { USD: 1 }, 1) });
    expect((await provider(fetchFn).fetchRates(code('USD'))).expiresAt).toBe(1_000_000 + 5_000);
  });

  it('404 і «unsupported-code» стають UnknownCurrencyError', async () => {
    await expect(provider(fakeFetch({})).fetchRates(code('XXX'))).rejects.toBeInstanceOf(UnknownCurrencyError);
    const unsupported = vi.fn().mockResolvedValue(jsonResponse({ result: 'error', 'error-type': 'unsupported-code' }, 200));
    await expect(provider(unsupported as unknown as typeof fetch).fetchRates(code('XXX'))).rejects.toBeInstanceOf(UnknownCurrencyError);
  });
});

describe('RatesService.shared (Singleton) і RatesService.create (Factory)', () => {
  it('shared повертає один і той самий сервіс', () => {
    expect(RatesService.shared()).toBe(RatesService.shared());
  });

  it('create щоразу створює новий', () => {
    expect(RatesService.create()).not.toBe(RatesService.create());
  });
});
