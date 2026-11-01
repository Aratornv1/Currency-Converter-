import { describe, expect, it, vi } from 'vitest';
import { createRatesService, getRatesService, RatesError } from '../src/rates';
import { fakeFetch, jsonResponse, ratesBody } from './helpers';

const usd = ratesBody('USD', { USD: 1, EUR: 0.9, UAH: 40, JPY: 150 });
const eur = ratesBody('EUR', { EUR: 1, USD: 1.1111, UAH: 44.4444 });

describe('convert', () => {
  it('множить суму на курс і округлює до 4 знаків', async () => {
    const service = createRatesService({ fetchFn: fakeFetch({ USD: usd }) });
    const result = await service.convert('USD', 'UAH', 12.5);
    expect(result).toMatchObject({ from: 'USD', to: 'UAH', amount: 12.5, rate: 40, result: 500 });
    expect(result.updatedAt).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  it('прибирає хвости плаваючої крапки', async () => {
    const body = ratesBody('USD', { USD: 1, AAA: 0.1 });
    const service = createRatesService({ fetchFn: fakeFetch({ USD: body }) });
    expect((await service.convert('USD', 'AAA', 3)).result).toBe(0.3); // 3 * 0.1 = 0.30000000000000004
  });

  it('сума 0 дає 0', async () => {
    const service = createRatesService({ fetchFn: fakeFetch({ USD: usd }) });
    expect((await service.convert('USD', 'EUR', 0)).result).toBe(0);
  });

  it('невідома цільова валюта дає 404', async () => {
    const service = createRatesService({ fetchFn: fakeFetch({ USD: usd }) });
    await expect(service.convert('USD', 'XXX', 1)).rejects.toMatchObject({ status: 404 });
  });

  it('невідома вихідна валюта дає 404', async () => {
    const service = createRatesService({ fetchFn: fakeFetch({ USD: usd }) });
    await expect(service.convert('XXX', 'USD', 1)).rejects.toMatchObject({ status: 404 });
  });
});

describe('listCurrencies', () => {
  it('повертає коди за абеткою', async () => {
    const service = createRatesService({ fetchFn: fakeFetch({ USD: usd }) });
    expect(await service.listCurrencies()).toEqual(['EUR', 'JPY', 'UAH', 'USD']);
  });
});

describe('кеш', () => {
  it('другий запит на ту саму валюту не йде до провайдера', async () => {
    const fetchFn = fakeFetch({ USD: usd });
    const service = createRatesService({ fetchFn });
    await service.convert('USD', 'EUR', 1);
    await service.convert('USD', 'UAH', 1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('кожна базова валюта кешується окремо', async () => {
    const fetchFn = fakeFetch({ USD: usd, EUR: eur });
    const service = createRatesService({ fetchFn });
    await service.convert('USD', 'EUR', 1);
    await service.convert('EUR', 'USD', 1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('одночасні запити ділять один виклик до провайдера', async () => {
    const fetchFn = fakeFetch({ USD: usd });
    const service = createRatesService({ fetchFn });
    await Promise.all([service.convert('USD', 'EUR', 1), service.convert('USD', 'UAH', 1), service.listCurrencies()]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('після часу наступного оновлення курси завантажуються знову', async () => {
    let time = 1_000_000; // now() у мілісекундах: зараз 1000 с
    const fetchFn = fakeFetch({ USD: ratesBody('USD', { USD: 1, EUR: 0.9 }, 1_000 + 60) }); // оновлення за 60 с
    const service = createRatesService({ fetchFn, now: () => time });
    await service.convert('USD', 'EUR', 1);
    time = 1_000_000 + 30_000; // ще не час
    await service.convert('USD', 'EUR', 1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    time = 1_000_000 + 61_000; // час минув
    await service.convert('USD', 'EUR', 1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('якщо час наступного оновлення вже минув, використовує запасний TTL', async () => {
    let time = 5_000_000;
    const fetchFn = fakeFetch({ USD: ratesBody('USD', { USD: 1, EUR: 0.9 }, 1) }); // 1970 рік
    const service = createRatesService({ fetchFn, now: () => time, fallbackTtlMs: 10_000 });
    await service.convert('USD', 'EUR', 1);
    time += 5_000;
    await service.convert('USD', 'EUR', 1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    time += 6_000;
    await service.convert('USD', 'EUR', 1);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('якщо провайдер недоступний, віддає застарілі курси', async () => {
    let time = 5_000_000;
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(jsonResponse(ratesBody('USD', { USD: 1, EUR: 0.9 }, 1)))
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const service = createRatesService({ fetchFn, now: () => time, fallbackTtlMs: 1_000 });
    await service.convert('USD', 'EUR', 1);
    time += 2_000; // кеш протух
    expect((await service.convert('USD', 'EUR', 10)).result).toBe(9);
  });

  it('помилку 404 не підміняє застарілими даними і не кешує її', async () => {
    const fetchFn = fakeFetch({});
    const service = createRatesService({ fetchFn });
    await expect(service.convert('XXX', 'USD', 1)).rejects.toMatchObject({ status: 404 });
    await expect(service.convert('XXX', 'USD', 1)).rejects.toMatchObject({ status: 404 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe('помилки провайдера', () => {
  const failing = (response: Response | Error) =>
    createRatesService({
      fetchFn: (response instanceof Error
        ? vi.fn().mockRejectedValue(response)
        : vi.fn().mockResolvedValue(response)) as unknown as typeof fetch,
    });

  it('мережева помилка дає 502', async () => {
    await expect(failing(new Error('boom')).convert('USD', 'EUR', 1)).rejects.toMatchObject({ status: 502 });
  });

  it('429 дає 502 з поясненням', async () => {
    const err = await failing(jsonResponse({}, 429)).convert('USD', 'EUR', 1).catch((e) => e);
    expect(err).toBeInstanceOf(RatesError);
    expect(err).toMatchObject({ status: 502, message: expect.stringContaining('rate limit') });
  });

  it('не-JSON відповідь дає 502', async () => {
    await expect(failing(new Response('<html>', { status: 200 })).convert('USD', 'EUR', 1)).rejects.toMatchObject({ status: 502 });
  });

  it('result не success дає 502', async () => {
    await expect(failing(jsonResponse({ result: 'error' })).convert('USD', 'EUR', 1)).rejects.toMatchObject({ status: 502 });
  });
});

describe('getRatesService (Singleton)', () => {
  it('повертає один і той самий сервіс', () => {
    expect(getRatesService()).toBe(getRatesService());
  });

  it('createRatesService (Factory) щоразу створює новий', () => {
    expect(createRatesService()).not.toBe(createRatesService());
  });
});
