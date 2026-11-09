import assert from 'node:assert';
import { createApp } from '../src/app.js';
import { dbAdapter } from '../src/db/client.js';

async function testHealth() {
  await dbAdapter.connect();
  const app = createApp();
  const port = 5002;

  const server = app.listen(port, '127.0.0.1', async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      assert.strictEqual(res.status, 200, 'HTTP status must be 200');

      const data = (await res.json()) as {
        status: string;
        service: string;
        version: string;
        database: { adapter: string; status: string };
      };

      assert.strictEqual(data.status, 'ok', 'Service status must be ok');
      assert.strictEqual(data.service, 'smart-campus-backend', 'Service name must match');
      assert.strictEqual(data.database.status, 'connected', 'Database status must be connected after connect()');
      assert.strictEqual(data.database.adapter, 'pglite', 'Database adapter must match configured adapter');

      console.log('✓ Health check test passed: HTTP 200, valid payload, database correctly reported as connected.');
      server.close(async () => {
        await dbAdapter.disconnect();
        process.exit(0);
      });
    } catch (err) {
      console.error('✗ Health check test assertion failed:', err);
      server.close(async () => {
        await dbAdapter.disconnect();
        process.exit(1);
      });
    }
  });
}

testHealth().catch((err) => {
  console.error('✗ Health check test fatal error:', err);
  process.exit(1);
});
