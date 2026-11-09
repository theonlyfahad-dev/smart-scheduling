import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { setupAdmin } from '../src/auth/setup.service.js';
import { verifyPassword } from '../src/auth/password.js';
import { ValidationError, ConflictError } from '../src/errors/app.errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupTestDb() {
  const pglite = new PGlite();
  const db = drizzle(pglite, { schema });

  // Load and apply SQL migration
  const migrationPath = path.resolve(__dirname, '../drizzle/0000_abnormal_leopardon.sql');
  const sqlContent = fs.readFileSync(migrationPath, 'utf8');
  const statements = sqlContent
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    await pglite.exec(stmt);
  }

  return { pglite, db };
}

async function runAuthSetupTestSuite(): Promise<void> {
  console.log('[Auth Setup Test Suite] Starting test suite...');
  const { pglite, db } = await setupTestDb();

  try {
    // 1 & 2: First call to setupAdmin() inserts row with role='ADMIN', is_active=true
    console.log('--- 1 & 2. Testing First-Run Admin Setup ---');
    const adminUser = await setupAdmin(db, 'superadmin', 'StrongPassword123!');
    assert.strictEqual(typeof adminUser.id, 'string', 'Returned id must be a string');
    assert.strictEqual(adminUser.username, 'superadmin', 'Returned username must match');
    assert.strictEqual(adminUser.role, 'ADMIN', 'Returned role must be ADMIN');

    const [persisted] = await db
      .select()
      .from(schema.userAccounts)
      .where(eq(schema.userAccounts.id, adminUser.id));

    assert.ok(persisted, 'Admin account must exist in user_accounts table');
    assert.strictEqual(persisted.username, 'superadmin');
    assert.strictEqual(persisted.role, 'ADMIN');
    assert.strictEqual(persisted.is_active, true, 'Admin account must be active');
    assert.strictEqual(persisted.faculty_id, null, 'Admin faculty_id must be null');

    const passwordVerified = await verifyPassword('StrongPassword123!', persisted.password_hash);
    assert.strictEqual(passwordVerified, true, 'Persisted password hash must verify with bcrypt');
    console.log('✓ First call to setupAdmin() successfully created ADMIN account with bcrypt hash.');

    // 3. Second call to setupAdmin() throws ConflictError
    console.log('--- 3. Testing Duplicate Setup Prevention ---');
    let duplicateConflictThrown = false;
    try {
      await setupAdmin(db, 'anotheradmin', 'AnotherPassword123!');
    } catch (err) {
      if (err instanceof ConflictError) {
        duplicateConflictThrown = true;
        assert.match(err.message, /already exists/i, 'Error message should state admin already exists');
      } else {
        throw err;
      }
    }
    assert.strictEqual(duplicateConflictThrown, true, 'Second setupAdmin call must throw ConflictError');

    const [{ count: adminCount }] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(schema.userAccounts)
      .where(eq(schema.userAccounts.role, 'ADMIN'));
    assert.strictEqual(adminCount, 1, 'Total admin count must remain exactly 1');
    console.log('✓ Second setupAdmin() call rejected with ConflictError; admin count remains 1.');

    // 4. Username shorter than 3 chars throws ValidationError
    console.log('--- 4 - 8. Testing Input Validation ---');
    await assert.rejects(
      async () => setupAdmin(db, 'ab', 'ValidPassword123!'),
      ValidationError,
      'Username < 3 chars must throw ValidationError'
    );
    console.log('✓ Username shorter than 3 chars rejected.');

    // 5. Password shorter than 8 chars throws ValidationError
    await assert.rejects(
      async () => setupAdmin(db, 'validuser', 'short'),
      ValidationError,
      'Password < 8 chars must throw ValidationError'
    );
    console.log('✓ Password shorter than 8 chars rejected.');

    // 6. Username containing spaces throws ValidationError
    await assert.rejects(
      async () => setupAdmin(db, 'admin user', 'ValidPassword123!'),
      ValidationError,
      'Username containing space must throw ValidationError'
    );
    console.log('✓ Username containing space rejected.');

    // 7. Username containing special characters throws ValidationError
    await assert.rejects(
      async () => setupAdmin(db, 'admin@root', 'ValidPassword123!'),
      ValidationError,
      'Username containing special character @ must throw ValidationError'
    );
    console.log('✓ Username containing invalid special character rejected.');

    // 8. Test fresh database remains empty after failed validation calls
    const { db: emptyDb, pglite: emptyPglite } = await setupTestDb();
    try {
      await assert.rejects(
        async () => setupAdmin(emptyDb, 'x', 'ValidPassword123!'),
        ValidationError
      );
      const [{ count: zeroCount }] = await emptyDb
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(schema.userAccounts)
        .where(eq(schema.userAccounts.role, 'ADMIN'));
      assert.strictEqual(zeroCount, 0, 'Database must have 0 ADMIN records after validation failure');
      console.log('✓ Database contains 0 admin rows after rejected validation attempts.');
    } finally {
      await emptyPglite.close();
    }

    // 9. Concurrency test: execute Promise.all([setupAdmin(), setupAdmin()]) on clean database
    console.log('--- 9. Testing Concurrency Protection & Advisory Lock ---');
    const { db: concurrentDb, pglite: concurrentPglite } = await setupTestDb();
    try {
      const results = await Promise.allSettled([
        setupAdmin(concurrentDb, 'admin_first', 'SecurePassword123!'),
        setupAdmin(concurrentDb, 'admin_second', 'SecurePassword123!'),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert.strictEqual(fulfilled.length, 1, 'Exactly one concurrent setup call must succeed');
      assert.strictEqual(rejected.length, 1, 'Exactly one concurrent setup call must fail');

      const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
      assert.ok(
        rejectionReason instanceof ConflictError,
        `Rejected call must throw ConflictError, got: ${rejectionReason}`
      );
      assert.match(
        rejectionReason.message,
        /already exists/i,
        'ConflictError message must indicate admin already exists'
      );

      const [{ count: concurrentAdminCount }] = await concurrentDb
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(schema.userAccounts)
        .where(eq(schema.userAccounts.role, 'ADMIN'));
      assert.strictEqual(concurrentAdminCount, 1, 'Database must contain exactly 1 ADMIN row after concurrent calls');
      console.log('✓ Concurrency test PASSED: exactly 1 setup succeeded, 1 rejected with ConflictError.');
    } finally {
      await concurrentPglite.close();
    }

    console.log('\n[Auth Setup Test Suite] All 9 assertions passed successfully.');
  } finally {
    await pglite.close();
  }
}

runAuthSetupTestSuite().catch((err) => {
  console.error('[Auth Setup Test Suite] FAILED:', err);
  process.exit(1);
});
