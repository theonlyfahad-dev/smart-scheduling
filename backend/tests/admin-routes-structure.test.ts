import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../src/db/schema.js';
import { createAdminMasterDataRouter } from '../src/routes/admin/master-data.routes.js';
import { hashPassword } from '../src/auth/password.js';
import { generateSessionToken, hashToken } from '../src/auth/token.js';
import { generateCsrfSecret } from '../src/auth/csrf.js';
import { SESSION_COOKIE_NAME } from '../src/auth/cookie.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupTestDb() {
  const pglite = new PGlite();
  const db = drizzle(pglite, { schema });

  const migrationPath = path.resolve(__dirname, '../drizzle/0000_abnormal_leopardon.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const statements = sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    await pglite.exec(stmt);
  }

  return { pglite, db };
}

function dispatch(router: any, options: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  cookies?: Record<string, string>;
  query?: Record<string, any>;
}): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    let responseBody: any = null;
    let resolved = false;

    const normalizedHeaders: Record<string, string> = {};
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        normalizedHeaders[k.toLowerCase()] = v;
      }
    }

    const req: any = {
      method: options.method.toUpperCase(),
      url: options.url,
      path: options.url.split('?')[0],
      headers: normalizedHeaders,
      body: options.body ?? {},
      cookies: options.cookies ?? {},
      query: options.query ?? {},
    };

    const triggerResolve = () => {
      if (!resolved) {
        resolved = true;
        resolve({ status: statusCode, body: responseBody });
      }
    };

    const res: any = {
      locals: {},
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(data: any) {
        responseBody = data;
        triggerResolve();
        return res;
      },
      send(data: any) {
        responseBody = data;
        triggerResolve();
        return res;
      },
    };

    router.handle(req, res, (err: any) => {
      if (err) {
        statusCode = 500;
        responseBody = { error: err.message };
      } else if (!resolved) {
        // Fell through the router without matching any route
        statusCode = 404;
        responseBody = { error: 'Not found' };
      }
      triggerResolve();
    });
  });
}

async function runAdminRoutesStructureTestSuite() {
  console.log('--- Running Admin Routes Structure & Security Tests ---');
  const { pglite, db } = await setupTestDb();
  const router = createAdminMasterDataRouter(db);

  // Setup Test Users: ADMIN and HOD
  const passwordHash = await hashPassword('SecurePass123!');
  const [adminUser] = await db
    .insert(schema.userAccounts)
    .values({
      username: 'superadmin',
      password_hash: passwordHash,
      role: 'ADMIN',
      is_active: true,
    })
    .returning();

  const [hodUser] = await db
    .insert(schema.userAccounts)
    .values({
      username: 'hoduser',
      password_hash: passwordHash,
      role: 'HOD',
      is_active: true,
    })
    .returning();

  // Create valid session for ADMIN
  const adminRawToken = generateSessionToken();
  const adminCsrfSecret = generateCsrfSecret();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(schema.userSessions).values({
    user_id: adminUser.id,
    token_hash: hashToken(adminRawToken),
    csrf_secret: adminCsrfSecret,
    expires_at: expiresAt,
  });

  // Create valid session for HOD
  const hodRawToken = generateSessionToken();
  const hodCsrfSecret = generateCsrfSecret();
  await db.insert(schema.userSessions).values({
    user_id: hodUser.id,
    token_hash: hashToken(hodRawToken),
    csrf_secret: hodCsrfSecret,
    expires_at: expiresAt,
  });

  // 1. Unauthenticated Request -> 401
  {
    const res = await dispatch(router, {
      method: 'GET',
      url: '/departments',
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'Authentication required');
    console.log('✔ Unauthenticated request rejects with 401');
  }

  // 2. HOD Authenticated Request -> 403 Forbidden
  {
    const res = await dispatch(router, {
      method: 'GET',
      url: '/departments',
      cookies: { [SESSION_COOKIE_NAME]: hodRawToken },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'Forbidden');
    console.log('✔ Non-admin role (HOD) rejects with 403 Forbidden');
  }

  // 3. Admin Authenticated GET Request -> 200 OK (Safe method CSRF exempt)
  {
    const res = await dispatch(router, {
      method: 'GET',
      url: '/departments',
      cookies: { [SESSION_COOKIE_NAME]: adminRawToken },
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.pagination);
    console.log('✔ Admin authenticated GET passes without CSRF header');
  }

  // 4. Admin Authenticated POST Request without CSRF Token -> 403 Forbidden
  {
    const res = await dispatch(router, {
      method: 'POST',
      url: '/departments',
      cookies: { [SESSION_COOKIE_NAME]: adminRawToken },
      body: { name: 'Computer Science', code: 'CS' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'Invalid CSRF token');
    console.log('✔ Mutating POST without CSRF token rejects with 403');
  }

  // 5. Admin Authenticated POST Request with Valid CSRF Token -> 201 Created
  let createdDeptId = '';
  {
    const res = await dispatch(router, {
      method: 'POST',
      url: '/departments',
      cookies: { [SESSION_COOKIE_NAME]: adminRawToken },
      headers: { 'x-csrf-token': adminCsrfSecret },
      body: { name: 'Computer Science', code: 'CS' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.name, 'Computer Science');
    assert.equal(res.body.data.code, 'CS');
    assert.equal(res.body.data.is_active, true);
    createdDeptId = res.body.data.id;
    console.log('✔ Mutating POST with valid CSRF token creates department (201)');
  }

  // 6. Admin Authenticated DELETE Request (Soft Deactivation) -> 200 OK
  {
    const res = await dispatch(router, {
      method: 'DELETE',
      url: `/departments/${createdDeptId}`,
      cookies: { [SESSION_COOKIE_NAME]: adminRawToken },
      headers: { 'x-csrf-token': adminCsrfSecret },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, createdDeptId);
    assert.equal(res.body.data.is_active, false);
    console.log('✔ DELETE /:id executes soft-deactivation (is_active: false)');
  }

  // 7. Verify no redundant /deactivate endpoint exists (should 404 or not be matched)
  {
    const res = await dispatch(router, {
      method: 'POST',
      url: `/departments/${createdDeptId}/deactivate`,
      cookies: { [SESSION_COOKIE_NAME]: adminRawToken },
      headers: { 'x-csrf-token': adminCsrfSecret },
    });
    assert.equal(res.status, 404);
    console.log('✔ Verified no redundant /deactivate endpoint exists');
  }

  // 8. Admin Authenticated POST /:id/activate (Reactivation) -> 200 OK
  {
    const res = await dispatch(router, {
      method: 'POST',
      url: `/departments/${createdDeptId}/activate`,
      cookies: { [SESSION_COOKIE_NAME]: adminRawToken },
      headers: { 'x-csrf-token': adminCsrfSecret },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.is_active, true);
    console.log('✔ POST /:id/activate reactivates entity (is_active: true)');
  }

  await pglite.close();
  console.log('--- ALL ADMIN ROUTES STRUCTURE TESTS PASSED ---');
}

runAdminRoutesStructureTestSuite().catch((err) => {
  console.error('Route structure test failure:', err);
  process.exit(1);
});
