import type { Request, Response } from 'express';
import { Amount } from './Amount';
import { CurrencyCode } from './CurrencyCode';
import type { RatesService } from './RatesService';

// HTTP-шар: читає параметри запиту, перетворює їх на value object-и, викликає сервіс і віддає JSON.
// Жодної логіки конвертації тут немає. Помилки (ValidationError тощо) не ловимо: Express 5 передає
// відхилення async-обробників в ErrorHandler сам.
export class ConverterController {
  constructor(private readonly rates: RatesService) {}

  // Обробники — стрілкові поля, щоб `this` не втрачався, коли Express викликає їх як звичайні функції
  listCurrencies = async (_req: Request, res: Response): Promise<void> => {
    res.json({ currencies: await this.rates.listCurrencies() });
  };

  convert = async (req: Request, res: Response): Promise<void> => {
    // Порядок важливий: перша помилка в цьому порядку (from, to, amount) і потрапляє до користувача
    const from = CurrencyCode.parse(req.query.from, 'from');
    const to = CurrencyCode.parse(req.query.to, 'to');
    const amount = Amount.parse(req.query.amount);
    res.json(await this.rates.convert(from, to, amount));
  };
}
