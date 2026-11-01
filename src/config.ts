try {
  process.loadEnvFile();
} catch {
  // .env необов'язковий: є значення за замовчуванням
}

const env = process.env;

// Number('abc') дає NaN, тому перевіряємо, що змінна справді ціле число в межах
function toInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number(env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}, got "${env[name]}"`);
  }
  return value;
}

export const config = {
  port: toInt('PORT', 3000, 1, 65535),
  ratesFallbackTtlSeconds: toInt('RATES_FALLBACK_TTL_SECONDS', 3600, 60, 86400),
  ratesApiUrl: 'https://open.er-api.com/v6/latest',
};
