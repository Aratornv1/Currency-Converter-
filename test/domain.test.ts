// Тести доменних класів: CurrencyCode, Amount, RatesSnapshot, Conversion, RatesCache, AppConfig, помилки.
import { describe, expect, it } from 'vitest';
import { Amount } from '../src/Amount';
import { AppConfig } from '../src/AppConfig';
import { Conversion } from '../src/Conversion';
import { CurrencyCode } from '../src/CurrencyCode';
import { AppError, ProviderError, UnknownCurrencyError, ValidationError } from '../src/errors';
import { RatesCache } from '../src/RatesCache';
import { RatesSnapshot } from '../src/RatesSnapshot';

const code = (value: string) => CurrencyCode.of(value);
const snapshot = new RatesSnapshot(code('USD'), { USD: 1, EUR: 0.9, UAH: 40 }, '2026-01-01T00:00:00.000Z');

describe('помилки (ієрархія)', () => {
  it('усі нащадки AppError і несуть свій статус', () => {
    expect(new ValidationError('x')).toMatchObject({ status: 400, name: 'ValidationError' });
    expect(new UnknownCurrencyError('XXX')).toMatchObject({ status: 404, message: 'Unknown currency: XXX' });
    expect(new ProviderError('x')).toMatchObject({ status: 502, name: 'ProviderError' });
    for (const err of [new ValidationError('x'), new UnknownCurrencyError('X'), new ProviderError('x')]) {
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});

describe('CurrencyCode', () => {
  it('нормалізує регістр і пробіли', () => {
    expect(CurrencyCode.parse(' usd ', 'from').value).toBe('USD');
    expect(String(code('uah'))).toBe('UAH');
  });

  it('відхиляє не-рядки та неправильні коди з назвою поля в повідомленні', () => {
    expect(() => CurrencyCode.parse(undefined, 'from')).toThrow('from is required');
    expect(() => CurrencyCode.parse(['USD', 'EUR'], 'to')).toThrow('to is required');
    for (const bad of ['', 'US', 'USDX', 'U5D', 'ГРН']) {
      expect(() => CurrencyCode.parse(bad, 'from')).toThrow(ValidationError);
    }
    expect(() => CurrencyCode.parse('US', 'to')).toThrow('to must be a 3-letter currency code');
  });

  it('equals порівнює за значенням', () => {
    expect(code('USD').equals(CurrencyCode.parse('usd', 'x'))).toBe(true);
    expect(code('USD').equals(code('EUR'))).toBe(false);
  });
});

describe('Amount', () => {
  it('приймає 12 і 12.5, відхиляє решту', () => {
    expect(Amount.parse('12').value).toBe(12);
    expect(Amount.parse(' 12.5 ').value).toBe(12.5);
    expect(Amount.parse('0').value).toBe(0);
    for (const bad of ['', '  ', 'abc', '-5', '1e3', '0x10', 'Infinity', '1,5', '.5']) {
      expect(() => Amount.parse(bad)).toThrow(ValidationError);
    }
    expect(() => Amount.parse(undefined)).toThrow('amount is required');
    expect(() => Amount.parse(12)).toThrow('amount is required'); // лише рядок із запиту
  });

  it('обмежує суму значенням Amount.MAX', () => {
    expect(Amount.parse(String(Amount.MAX)).value).toBe(1e12);
    expect(() => Amount.parse('1000000000001')).toThrow('amount must not exceed 1000000000000');
  });

  it('times округлює до 4 знаків', () => {
    expect(Amount.parse('3').times(0.1)).toBe(0.3); // 3 * 0.1 = 0.30000000000000004
    expect(Amount.parse('1').times(1 / 3)).toBe(0.3333);
  });
});

describe('RatesSnapshot', () => {
  it('currencies() — коди за абеткою, rateTo() — курс або undefined', () => {
    expect(snapshot.currencies()).toEqual(['EUR', 'UAH', 'USD']);
    expect(snapshot.rateTo(code('UAH'))).toBe(40);
    expect(snapshot.rateTo(code('XXX'))).toBeUndefined();
  });
});

describe('Conversion', () => {
  it('Conversion.of рахує результат і зберігає курс та час оновлення', () => {
    const c = Conversion.of(snapshot, code('UAH'), Amount.parse('2.5'));
    expect(c).toMatchObject({ from: 'USD', to: 'UAH', amount: 2.5, rate: 40, result: 100, updatedAt: '2026-01-01T00:00:00.000Z' });
  });

  it('невідома цільова валюта → UnknownCurrencyError', () => {
    expect(() => Conversion.of(snapshot, code('XXX'), Amount.parse('1'))).toThrow(UnknownCurrencyError);
  });

  it('JSON.stringify використовує toJSON: порядок і набір полів фіксовані', () => {
    const json = JSON.parse(JSON.stringify(Conversion.of(snapshot, code('EUR'), Amount.parse('10'))));
    expect(Object.keys(json)).toEqual(['from', 'to', 'amount', 'rate', 'result', 'updatedAt']);
    expect(json.result).toBe(9);
  });
});

describe('RatesCache', () => {
  it('getFresh повертає знімок до expiresAt і undefined після', () => {
    let time = 1000;
    const cache = new RatesCache(() => time);
    cache.set(code('USD'), snapshot, 2000);
    expect(cache.getFresh(code('USD'))).toBe(snapshot);
    time = 2000; // рівно в момент закінчення — вже протух
    expect(cache.getFresh(code('USD'))).toBeUndefined();
  });

  it('getStale віддає знімок навіть після закінчення; для невідомої бази undefined', () => {
    let time = 1000;
    const cache = new RatesCache(() => time);
    cache.set(code('USD'), snapshot, 1500);
    time = 99_999;
    expect(cache.getStale(code('USD'))).toBe(snapshot);
    expect(cache.getStale(code('EUR'))).toBeUndefined();
    expect(cache.getFresh(code('EUR'))).toBeUndefined();
  });
});

describe('AppConfig', () => {
  it('значення за замовчуванням', () => {
    const config = AppConfig.defaults();
    expect(config).toMatchObject({ port: 3000, ratesFallbackTtlSeconds: 3600, ratesApiUrl: AppConfig.DEFAULT_API_URL });
    expect(config.ratesFallbackTtlMs).toBe(3_600_000);
  });

  it('читає PORT і RATES_FALLBACK_TTL_SECONDS зі свого env, а не з process.env', () => {
    const config = AppConfig.fromEnv({ PORT: '8080', RATES_FALLBACK_TTL_SECONDS: '120' });
    expect(config.port).toBe(8080);
    expect(config.ratesFallbackTtlMs).toBe(120_000);
  });

  it('неправильні значення зупиняють створення конфігу з поясненням', () => {
    expect(() => AppConfig.fromEnv({ PORT: 'abc' })).toThrow('PORT must be an integer from 1 to 65535, got "abc"');
    expect(() => AppConfig.fromEnv({ PORT: '70000' })).toThrow(/PORT/);
    expect(() => AppConfig.fromEnv({ RATES_FALLBACK_TTL_SECONDS: '5' })).toThrow(/RATES_FALLBACK_TTL_SECONDS/);
    expect(() => AppConfig.fromEnv({ PORT: '3.5' })).toThrow(/PORT/);
  });
});
