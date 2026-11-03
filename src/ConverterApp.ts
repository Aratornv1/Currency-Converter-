import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import { ConverterController } from './ConverterController';
import { ErrorHandler } from './ErrorHandler';
import type { RatesService } from './RatesService';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));

// Застосунок: збирає Express із контролера й обробника помилок. Залежність (RatesService) — з конструктора.
export class ConverterApp {
  readonly express: Express; // публічний, щоб тести могли передати його в supertest без запуску сервера

  constructor(rates: RatesService) {
    const controller = new ConverterController(rates);
    const errors = new ErrorHandler();

    const app = express();
    app.disable('x-powered-by');

    app.get('/api/currencies', controller.listCurrencies);
    app.get('/api/convert', controller.convert);
    app.use(express.static(publicDir));
    app.use('/api', errors.notFound);
    app.use(errors.handle); // обовʼязково останнім

    this.express = app;
  }

  listen(port: number, onListening?: () => void): Server {
    return this.express.listen(port, onListening);
  }
}
