import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ConverterApp } from '../src/ConverterApp';
import { RatesService } from '../src/RatesService';
import { fakeFetch, jsonResponse, ratesBody } from './helpers';

const usd = ratesBody('USD', { USD: 1, EUR: 0.9, UAH: 40 });
const makeApp = (fetchFn: typeof fetch = fakeFetch({ USD: usd })) =>
  new ConverterApp(RatesService.create({ fetchFn })).express;

describe('GET /api/currencies', () => {
  it('повертає відсортований список кодів', async () => {
    const res = await request(makeApp()).get('/api/currencies');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currencies: ['EUR', 'UAH', 'USD'] });
  });

  it('якщо провайдер недоступний, дає 502 з JSON', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch;
    const res = await request(makeApp(fetchFn)).get('/api/currencies');
    expect(res.status).toBe(502);
    expect(res.body.error).toBeTruthy();
  });
});

describe('GET /api/convert', () => {
  it('конвертує суму; форма відповіді визначена Conversion.toJSON', async () => {
    const res = await request(makeApp()).get('/api/convert?from=USD&to=UAH&amount=12.5');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ from: 'USD', to: 'UAH', amount: 12.5, rate: 40, result: 500 });
    expect(Object.keys(res.body)).toEqual(['from', 'to', 'amount', 'rate', 'result', 'updatedAt']);
  });

  it('приймає коди в нижньому регістрі та з пробілами', async () => {
    const res = await request(makeApp()).get('/api/convert?from=%20usd&to=eur&amount=10');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ from: 'USD', to: 'EUR', result: 9 });
  });

  it.each([
    ['без from', '?to=UAH&amount=1', 'from is required'],
    ['без to', '?from=USD&amount=1', 'to is required'],
    ['без amount', '?from=USD&to=UAH', 'amount is required'],
    ['порожня сума', '?from=USD&to=UAH&amount=', 'amount is required'],
    ['довгий код', '?from=USDX&to=UAH&amount=1', 'from must be a 3-letter currency code'],
    ['код з цифрами', '?from=U5D&to=UAH&amount=1', 'from must be a 3-letter currency code'],
    ['текст замість суми', '?from=USD&to=UAH&amount=abc', 'amount must be a non-negative number'],
    ['від’ємна сума', '?from=USD&to=UAH&amount=-5', 'amount must be a non-negative number'],
    ['експоненційний запис', '?from=USD&to=UAH&amount=1e3', 'amount must be a non-negative number'],
    ['шістнадцятковий запис', '?from=USD&to=UAH&amount=0x10', 'amount must be a non-negative number'],
    ['Infinity', '?from=USD&to=UAH&amount=Infinity', 'amount must be a non-negative number'],
    ['занадто велика сума', '?from=USD&to=UAH&amount=1000000000001', 'amount must not exceed 1000000000000'],
    ['повторений параметр', '?from=USD&from=EUR&to=UAH&amount=1', 'from is required'],
  ])('400 (ValidationError): %s', async (_name, query, message) => {
    const res = await request(makeApp()).get(`/api/convert${query}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: message });
  });

  it('першою повертається помилка в порядку from → to → amount', async () => {
    const res = await request(makeApp()).get('/api/convert?from=1&to=2&amount=x');
    expect(res.body.error).toContain('from');
  });

  it('404 для невідомої цільової валюти', async () => {
    const res = await request(makeApp()).get('/api/convert?from=USD&to=XXX&amount=1');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('XXX');
  });

  it('404 для невідомої вихідної валюти', async () => {
    const res = await request(makeApp()).get('/api/convert?from=XXX&to=USD&amount=1');
    expect(res.status).toBe(404);
  });

  it('502 при ліміті запитів провайдера', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, 429)) as unknown as typeof fetch;
    const res = await request(makeApp(fetchFn)).get('/api/convert?from=USD&to=UAH&amount=1');
    expect(res.status).toBe(502);
  });
});

describe('інше', () => {
  it('невідомий /api-шлях дає JSON 404', async () => {
    const res = await request(makeApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Route not found' });
  });

  it('віддає сторінку з атрибуцією ExchangeRate-API', async () => {
    const res = await request(makeApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Rates By Exchange Rate API');
  });

  it('не показує заголовок x-powered-by', async () => {
    const res = await request(makeApp()).get('/api/currencies');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('неочікувана помилка (баг) дає 500 без деталей', async () => {
    const buggy = { listCurrencies: () => { throw new TypeError('secret detail'); } } as unknown as RatesService;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(new ConverterApp(buggy).express).get('/api/currencies');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
