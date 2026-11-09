import assert from 'node:assert';
import pg from 'pg';
import {
  createDatabaseAdapter,
  PgliteAdapter,
  PostgresAdapter,
} from '../src/db/client.js';

async function runAdapterTests(): Promise<void> {
  console.log('[Adapter Test Suite] Starting database adapter verification...');

  // =========================================================================
  // TEST GROUP 1: PGlite Adapter Lifecycle & Behavior
  // =========================================================================
  console.log('\n--- 1. Testing PGlite Adapter ---');
  const pgliteAdapter = new PgliteAdapter({ inMemory: true });

  assert.strictEqual(pgliteAdapter.type, 'pglite', 'Adapter type must be pglite');
  assert.strictEqual(pgliteAdapter.status, 'disconnected', 'Initial status must be disconnected');

  // Must reject db access before connection
  assert.throws(
    () => {
      // @ts-expect-error accessing db to test guard
      const _ = pgliteAdapter.db;
    },
    /Database is not connected/,
    'Accessing db before connect must throw descriptive error'
  );

  // 1a. Connect succeeds
  await pgliteAdapter.connect();
  assert.strictEqual(pgliteAdapter.status, 'connected', 'Status must be connected after connect()');
  assert.ok(pgliteAdapter.db, 'db property must be defined and accessible');

  // 1b. Duplicate connect() is idempotent
  await pgliteAdapter.connect();
  assert.strictEqual(pgliteAdapter.status, 'connected', 'Duplicate connect must remain connected');

  // 1c. Close succeeds
  await pgliteAdapter.disconnect();
  assert.strictEqual(pgliteAdapter.status, 'disconnected', 'Status must be disconnected after disconnect()');

  // 1d. Access after disconnect throws
  assert.throws(
    () => {
      const _ = pgliteAdapter.db;
    },
    /Database is not connected/,
    'Accessing db after disconnect must throw descriptive error'
  );

  console.log('✓ PGlite connection, idempotency, and clean disconnect verified.');

  // =========================================================================
  // TEST GROUP 2: PostgreSQL Adapter Configuration Validation
  // =========================================================================
  console.log('\n--- 2. Testing PostgreSQL Adapter Validation ---');

  // 2a. Missing URL rejection
  const pgMissingUrl = new PostgresAdapter({ databaseUrl: '' });
  await assert.rejects(
    async () => {
      await pgMissingUrl.connect();
    },
    /DATABASE_URL is required/,
    'PostgreSQL adapter must reject empty or missing DATABASE_URL'
  );
  assert.strictEqual(pgMissingUrl.status, 'error', 'Status must be error after failed connection');

  // 2b. Invalid URL scheme rejection
  const pgInvalidScheme = new PostgresAdapter({ databaseUrl: 'mysql://root:pass@localhost:3306/db' });
  await assert.rejects(
    async () => {
      await pgInvalidScheme.connect();
    },
    /Invalid PostgreSQL URL/,
    'PostgreSQL adapter must reject non-PostgreSQL URL schemes'
  );
  assert.strictEqual(pgInvalidScheme.status, 'error', 'Status must be error after invalid scheme rejection');

  console.log('✓ PostgreSQL configuration validation (missing & invalid URLs) verified.');

  // =========================================================================
  // TEST GROUP 3: PostgreSQL Adapter Lifecycle (Using Mock Pool)
  // [MOCKED TEST]: Simulates local pg driver without requiring remote DB connection
  // =========================================================================
  console.log('\n--- 3. Testing PostgreSQL Adapter Lifecycle (Mocked Driver) ---');
  let probeQueryExecuted = false;
  let clientReleased = false;
  let poolEnded = false;

  const mockClient = {
    query: async (queryText: string) => {
      if (queryText === 'SELECT 1') {
        probeQueryExecuted = true;
        return { rows: [{ '?column?': 1 }] };
      }
      return { rows: [] };
    },
    release: () => {
      clientReleased = true;
    },
  };

  const mockPool = {
    connect: async () => mockClient,
    end: async () => {
      poolEnded = true;
    },
    on: () => {},
  } as unknown as pg.Pool;

  const pgMocked = new PostgresAdapter({
    databaseUrl: 'postgres://postgres:postgres@localhost:5432/mock_test',
    pool: mockPool,
  });

  assert.strictEqual(pgMocked.type, 'pg');
  assert.strictEqual(pgMocked.status, 'disconnected');

  // 3a. Connect succeeds using mock pool
  await pgMocked.connect();
  assert.strictEqual(pgMocked.status, 'connected', 'Status must be connected on successful pool probe');
  assert.strictEqual(probeQueryExecuted, true, 'Probe query SELECT 1 must be executed');
  assert.strictEqual(clientReleased, true, 'Probing client must be released back to the pool');
  assert.ok(pgMocked.db, 'Drizzle db property must be exposed on connected adapter');

  // 3b. Duplicate connect is a no-op
  await pgMocked.connect();
  assert.strictEqual(pgMocked.status, 'connected');

  // 3c. Disconnect ends pool
  await pgMocked.disconnect();
  assert.strictEqual(pgMocked.status, 'disconnected', 'Status must be disconnected after disconnect()');
  assert.strictEqual(poolEnded, true, 'pg.Pool.end() must be called on disconnect()');

  console.log('✓ [MOCKED TEST] PostgreSQL connection lifecycle, probe query, and pool.end() verified.');

  // =========================================================================
  // TEST GROUP 4: Controlled Error Handling on Failed Connection
  // [MOCKED TEST]: Simulates network/socket error from driver
  // =========================================================================
  console.log('\n--- 4. Testing Controlled Error Handling on Failed Connection ---');
  const mockFailingPool = {
    connect: async () => {
      throw new Error('Connection refused at 127.0.0.1:5432');
    },
    end: async () => {},
    on: () => {},
  } as unknown as pg.Pool;

  const pgFailing = new PostgresAdapter({
    databaseUrl: 'postgres://postgres:postgres@localhost:5432/fail_test',
    pool: mockFailingPool,
  });

  await assert.rejects(
    async () => {
      await pgFailing.connect();
    },
    /Connection refused at 127.0.0.1:5432/,
    'Failed connect must rethrow controlled error'
  );
  assert.strictEqual(pgFailing.status, 'error', 'Status must be set to error on connection failure');

  console.log('✓ [MOCKED TEST] Controlled error propagation and error status transition verified.');

  // =========================================================================
  // TEST GROUP 5: Factory Selection & Independent Isolation
  // =========================================================================
  console.log('\n--- 5. Testing Adapter Factory Selection & State Isolation ---');

  // 5a. Explicit selection follows options.adapter
  const factoryPg = createDatabaseAdapter({
    adapter: 'pg',
    databaseUrl: 'postgres://localhost:5432/test',
    pool: mockPool,
  });
  assert.strictEqual(factoryPg.type, 'pg', 'Factory must return pg adapter when requested');

  const factoryPglite = createDatabaseAdapter({
    adapter: 'pglite',
    inMemory: true,
  });
  assert.strictEqual(factoryPglite.type, 'pglite', 'Factory must return pglite adapter when requested');

  // 5b. Independent test state isolation (two separate in-memory instances do not share state)
  const instanceA = createDatabaseAdapter({ adapter: 'pglite', inMemory: true });
  const instanceB = createDatabaseAdapter({ adapter: 'pglite', inMemory: true });

  await instanceA.connect();
  await instanceB.connect();

  // Execute DDL on instance A only
  // @ts-expect-error client access for raw test DDL
  await instanceA._client.exec('CREATE TABLE test_isolation (id int);');

  // Query table existence on instance A (must exist)
  // @ts-expect-error client access
  const resA = await instanceA._client.query("SELECT to_regclass('test_isolation') as tbl;");
  assert.ok(resA.rows[0].tbl, 'Table must exist on instance A');

  // Query table existence on instance B (must NOT exist)
  // @ts-expect-error client access
  const resB = await instanceB._client.query("SELECT to_regclass('test_isolation') as tbl;");
  assert.strictEqual(resB.rows[0].tbl, null, 'Table must NOT exist on independent instance B');

  await instanceA.disconnect();
  await instanceB.disconnect();

  console.log('✓ Factory selection and independent test state isolation verified.');

  console.log('\n[Adapter Test Suite] All adapter tests PASSED successfully.');
}

runAdapterTests().catch((err) => {
  console.error('\n[Adapter Test Suite] Test failed with error:', err);
  process.exit(1);
});
