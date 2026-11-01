import { createApp } from './app';
import { config } from './config';
import { getRatesService } from './rates';

const server = createApp(getRatesService()).listen(config.port, () => {
  console.log(`Currency converter listening on http://localhost:${config.port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
