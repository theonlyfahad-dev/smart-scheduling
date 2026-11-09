import { createApp } from './app.js';
import { env } from './config/env.js';
import { dbAdapter } from './db/client.js';

async function bootstrap() {
  await dbAdapter.connect();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.log(`[Smart Campus] Backend running on http://localhost:${env.PORT}`);
    console.log(`[Smart Campus] Environment: ${env.NODE_ENV}`);
    console.log(`[Smart Campus] Database adapter: ${dbAdapter.type}`);
  });

  const shutdown = async () => {
    console.log('\n[Smart Campus] Shutting down gracefully...');
    server.close(async () => {
      await dbAdapter.disconnect();
      console.log('[Smart Campus] Server terminated.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Smart Campus] Fatal bootstrap error:', err);
  process.exit(1);
});
