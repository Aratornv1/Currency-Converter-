import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errors';

// Єдине місце, де помилки стають HTTP-відповідями.
export class ErrorHandler {
  // Невідомий /api-шлях: JSON, а не HTML-сторінка Express
  notFound = (_req: Request, res: Response): void => {
    res.status(404).json({ error: 'Route not found' });
  };

  // Express розпізнає middleware помилок за чотирма параметрами, тому _next потрібен, хоч і не використовується
  handle = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: err.message }); // очікувана помилка: статус уже в самій помилці
      return;
    }
    console.error(err); // баг: деталі лише в лог, клієнту загальне повідомлення
    res.status(500).json({ error: 'Internal server error' });
  };
}
