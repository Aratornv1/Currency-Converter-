# Currency Converter

Конвертер валют: Express-сервер із кешем курсів і сторінка з випадними списками. Дані: [ExchangeRate-API](https://www.exchangerate-api.com) (open access: без ключа, курси оновлюються раз на добу, потрібна атрибуція).

Задача: [roadmap-ідея з Strapi](https://strapi.io/blog/api-project-ideas#beginner-api-project-ideas).

## Запуск
```bash
npm install
npm start          # http://localhost:3000
npm test           # 64 тести, мережа не потрібна
npm run typecheck
```
`.env` необов'язковий (див. `.env.example`).

## API
| Метод | Шлях | Відповідь |
|---|---|---|
| GET | `/api/currencies` | `{ "currencies": ["AED", "AFN", ...] }` |
| GET | `/api/convert?from=USD&to=UAH&amount=100` | `{ from, to, amount, rate, result, updatedAt }` |

Помилки повертаються як `{ "error": "..." }`: `400` (поганий ввід), `404` (невідома валюта), `502` (провайдер недоступний або вичерпано ліміт).

## Як це працює
Код написано на класах (гілка `refactor-oop`); докладний розбір у `guide.html`.

| Клас | Файл | Роль |
|---|---|---|
| `ConverterApp` | `src/ConverterApp.ts` | збирає Express: маршрути, статика, обробник помилок |
| `ConverterController` | `src/ConverterController.ts` | читає параметри запиту, викликає сервіс, віддає JSON |
| `ErrorHandler` | `src/ErrorHandler.ts` | єдине місце, де помилки стають HTTP-відповідями |
| `RatesService` | `src/RatesService.ts` | кеш, спільні запити, запасні курси; Factory `create()` і Singleton `shared()` |
| `RatesProvider` (інтерфейс) | `src/RatesProvider.ts` | контракт «звідки беруться курси» |
| `ExchangeRateApiProvider` | `src/ExchangeRateApiProvider.ts` | реалізація для ExchangeRate-API |
| `RatesCache` | `src/RatesCache.ts` | кеш у памʼяті з часом життя запису |
| `RatesSnapshot`, `Conversion` | `src/RatesSnapshot.ts`, `src/Conversion.ts` | знімок курсів і результат конвертації |
| `CurrencyCode`, `Amount` | `src/CurrencyCode.ts`, `src/Amount.ts` | value object-и: код валюти й сума, правильні за побудовою |
| `AppConfig` | `src/AppConfig.ts` | PORT і TTL з перевіркою при створенні |
| `AppError` → `ValidationError` / `UnknownCurrencyError` / `ProviderError` | `src/errors.ts` | ієрархія помилок зі статусом 400 / 404 / 502 |

- Курси лежать у пам'яті до часу `time_next_update_unix`, який повертає API, тож за добу робиться кілька запитів, а не по запиту на кожну конвертацію.
- Одночасні запити на ту саму валюту ділять один виклик до провайдера.
- Якщо провайдер недоступний, а старі курси є, віддаються вони (помилку «такої валюти немає» ними не підміняємо).
- `RatesService.create()` — Factory (новий сервіс із власним кешем, зручно для тестів). `RatesService.shared()` — Singleton (спільний кеш на весь застосунок). `fetch` і годинник передаються параметрами (Dependency Injection), тому тести працюють без мережі.
- Сума перевіряється суворо: лише `12` або `12.5` (не `1e3`, не `0x10`), не більше `1e12`.
- Результат округлюється до 4 знаків, щоб прибрати хвости плаваючої крапки.

## Атрибуція
Умова безкоштовного доступу: посилання «Rates By Exchange Rate API» на сторінці (є в підвалі).
