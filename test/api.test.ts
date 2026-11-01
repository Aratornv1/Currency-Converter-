import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { createRatesService } from '../src/rates';
import { fakeFetch, jsonResponse, ratesBody } from './helpers';

const usd = ratesBody('USD', { USD: 1, EUR: 0.9, UAH: 40 });
const makeApp = (fetchFn: typeof fetch = fakeFetch({ USD: usd })) => createApp(createRatesService({ fetchFn }));

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
  it('конвертує суму', async () => {
    const res = await request(makeApp()).get('/api/convert?from=USD&to=UAH&amount=12.5');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ from: 'USD', to: 'UAH', amount: 12.5, rate: 40, result: 500 });
  });

  it('приймає коди в нижньому регістрі та з пробілами', async () => {
    const res = await request(makeApp()).get('/api/convert?from=%20usd&to=eur&amount=10');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ from: 'USD', to: 'EUR', result: 9 });
  });

  it.each([
    ['без from', '?to=UAH&amount=1'],
    ['без to', '?from=USD&amount=1'],
    ['без amount', '?from=USD&to=UAH'],
    ['порожня сума', '?from=USD&to=UAH&amount='],
    ['довгий код', '?from=USDX&to=UAH&amount=1'],
    ['код з цифрами', '?from=U5D&to=UAH&amount=1'],
    ['текст замість суми', '?from=USD&to=UAH&amount=abc'],
    ['від’ємна сума', '?from=USD&to=UAH&amount=-5'],
    ['експоненційний запис', '?from=USD&to=UAH&amount=1e3'],
    ['шістнадцятковий запис', '?from=USD&to=UAH&amount=0x10'],
    ['Infinity', '?from=USD&to=UAH&amount=Infinity'],
    ['занадто велика сума', '?from=USD&to=UAH&amount=1000000000001'],
    ['повторений параметр', '?from=USD&from=EUR&to=UAH&amount=1'],
  ])('400: %s', async (_name, query) => {
    const res = await request(makeApp()).get(`/api/convert${query}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
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
});
