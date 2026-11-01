import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { RatesError, type RatesService } from './rates';
import { parseAmount, parseCurrencyCode } from './validation';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

export function createApp(rates: RatesService) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/currencies', async (_req, res) => {
    res.json({ currencies: await rates.listCurrencies() });
  });

  app.get('/api/convert', async (req, res) => {
    const from = parseCurrencyCode(req.query.from, 'from');
    const to = parseCurrencyCode(req.query.to, 'to');
    const amount = parseAmount(req.query.amount);
    if (!from.ok) return res.status(400).json({ error: from.error });
    if (!to.ok) return res.status(400).json({ error: to.error });
    if (!amount.ok) return res.status(400).json({ error: amount.error });
    res.json(await rates.convert(from.data, to.data, amount.data));
  });

  app.use(express.static(publicDir));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  // Express 5 передає помилки з async-обробників сюди сам
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof RatesError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
