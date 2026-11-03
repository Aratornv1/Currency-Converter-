import type { CurrencyCode } from './CurrencyCode';
import type { RatesSnapshot } from './RatesSnapshot';

// Те, що провайдер віддає сервісу: знімок курсів і момент, до якого його можна вважати свіжим.
export interface ProviderRates {
  snapshot: RatesSnapshot;
  expiresAt: number; // мс від епохи
}

// Контракт «звідки беруться курси». RatesService залежить лише від цього інтерфейсу, а не від
// конкретного сервісу: щоб перейти на інший API, пишеш інший клас, який реалізує RatesProvider.
export interface RatesProvider {
  fetchRates(base: CurrencyCode): Promise<ProviderRates>;
}
