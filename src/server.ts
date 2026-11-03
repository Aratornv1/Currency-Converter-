// Точка входу й composition root: тут створюються й з'єднуються реальні обʼєкти.
import { AppConfig } from './AppConfig';
import { ConverterApp } from './ConverterApp';
import { RatesService } from './RatesService';

const config = AppConfig.load();
const server = new ConverterApp(RatesService.shared()).listen(config.port, () => {
  console.log(`Currency converter listening on http://localhost:${config.port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
