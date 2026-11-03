// Налаштування застосунку. Усі значення перевіряються при створенні: неправильний PORT
// не дає програмі стартувати, а не ламає її пізніше.
export class AppConfig {
  static readonly DEFAULT_API_URL = 'https://open.er-api.com/v6/latest';

  // Чиста функція від env: у тестах передаємо свій обʼєкт і не чіпаємо process.env
  static fromEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
    return new AppConfig(
      AppConfig.toInt(env, 'PORT', 3000, 1, 65535),
      AppConfig.toInt(env, 'RATES_FALLBACK_TTL_SECONDS', 3600, 60, 86400),
      AppConfig.DEFAULT_API_URL,
    );
  }

  // Значення за замовчуванням, без .env і змінних середовища
  static defaults(): AppConfig {
    return AppConfig.fromEnv({});
  }

  // Для запуску застосунку: спершу підвантажує .env (він необовʼязковий), потім читає env
  static load(): AppConfig {
    try {
      process.loadEnvFile();
    } catch {
      // .env необов'язковий: є значення за замовчуванням
    }
    return AppConfig.fromEnv();
  }

  // Number('abc') дає NaN, тому перевіряємо, що змінна справді ціле число в межах
  private static toInt(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
    const value = Number(env[name] ?? fallback);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer from ${min} to ${max}, got "${env[name]}"`);
    }
    return value;
  }

  private constructor(
    readonly port: number,
    readonly ratesFallbackTtlSeconds: number,
    readonly ratesApiUrl: string,
  ) {}

  get ratesFallbackTtlMs(): number {
    return this.ratesFallbackTtlSeconds * 1000;
  }
}
