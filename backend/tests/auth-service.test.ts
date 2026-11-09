import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { setupAdmin } from '../src/auth/setup.service.js';
import { login, logout } from '../src/auth/auth.service.js';
import { hashToken } from '../src/auth/token.js';
import { SESSION_COOKIE_NAME, buildCookieOptions } from '../src/auth/cookie.js';
import { isOriginAllowed, createAuthRouter } from '../src/auth/auth.routes.js';
import { ValidationError } from '../src/errors/app.errors.js';
import { env } from '../src/config/env.js';

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

/**
 * In-memory mock dispatcher for Express route testing.
 * Runs route handlers without opening network sockets, avoiding sandbox connect permissions.
 */
function createMockDispatcher(router: any) {
  return async function dispatch(options: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    headers?: Record<string, string>;
    body?: any;
    cookies?: Record<string, string>;
    ip?: string;
  }) {
    let statusCode = 200;
    let responseBody: any = null;
    const responseHeaders: Record<string, string | string[]> = {};
    const setCookies: Array<{ name: string; val: string; options: any }> = [];
    const clearedCookies: Array<{ name: string; options: any }> = [];

    const normalizedHeaders: Record<string, string> = {};
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        normalizedHeaders[k.toLowerCase()] = v;
      }
    }

    const req: any = {
      method: options.method,
      url: options.path,
      path: options.path,
      headers: normalizedHeaders,
      body: options.body ?? {},
      cookies: options.cookies ?? {},
      ip: options.ip ?? '127.0.0.1',
    };

    let resolved = false;

    return new Promise<{
      status: number;
      body: any;
      headers: Record<string, string | string[]>;
      setCookies: Array<{ name: string; val: string; options: any }>;
      clearedCookies: Array<{ name: string; options: any }>;
    }>((resolve, reject) => {
      const res: any = {
        locals: {},
        status(code: number) {
          statusCode = code;
          return res;
        },
        json(data: any) {
          responseBody = data;
          if (!resolved) {
            resolved = true;
            resolve({
              status: statusCode,
              body: responseBody,
              headers: responseHeaders,
              setCookies,
              clearedCookies,
            });
          }
          return res;
        },
        setHeader(name: string, value: string | string[]) {
          responseHeaders[name.toLowerCase()] = value;
          return res;
        },
        cookie(name: string, val: string, opts: any) {
          setCookies.push({ name, val, options: opts });
          return res;
        },
        clearCookie(name: string, opts: any) {
          clearedCookies.push({ name, options: opts });
          return res;
        },
      };

      try {
        router.handle(req, res, (err: any) => {
          if (err) {
            reject(err);
          } else if (!resolved) {
            resolved = true;
            resolve({
              status: statusCode,
              body: responseBody,
              headers: responseHeaders,
              setCookies,
              clearedCookies,
            });
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  };
}

async function runAuthServiceTestSuite(): Promise<void> {
  console.log('[Auth Service Test Suite] Starting test suite...');
  const { pglite, db } = await setupTestDb();

  try {
    // Seed an initial Admin account
    const adminPassword = 'AdminSecretPassword123!';
    const adminUser = await setupAdmin(db, 'TestAdmin', adminPassword);
    console.log(`✓ Admin account created for tests: ${adminUser.username} (${adminUser.id})`);

    // 1. Valid login returns rawToken, csrfSecret, expiresAt, and user info
    console.log('\n--- 1 - 4. Testing Service Login & Session Persistence ---');
    // Test case-insensitive username match: 'testadmin' vs created 'TestAdmin'
    const loginResult = await login(db, 'testadmin', adminPassword, {
      ip: '192.168.1.100',
      userAgent: 'Mozilla/5.0 TestSuite',
    });

    assert.ok(loginResult.rawToken, 'LoginResult must include rawToken');
    assert.strictEqual(typeof loginResult.rawToken, 'string');
    assert.strictEqual(loginResult.rawToken.length, 64, 'rawToken must be 64 hex characters');
    assert.strictEqual(loginResult.csrfSecret.length, 64, 'csrfSecret must be 64 hex characters');
    assert.ok(loginResult.expiresAt instanceof Date, 'expiresAt must be a Date instance');
    assert.strictEqual(loginResult.user.id, adminUser.id, 'User ID must match authenticated admin');
    assert.strictEqual(loginResult.user.username, 'TestAdmin', 'User username must match database record');
    assert.strictEqual(loginResult.user.role, 'ADMIN', 'User role must be ADMIN');
    console.log('✓ 1. Valid login succeeded with case-insensitive username and correct payload structure.');

    // 2. Session row persistence in user_sessions
    const expectedHash = hashToken(loginResult.rawToken);
    const [sessionRow] = await db
      .select()
      .from(schema.userSessions)
      .where(eq(schema.userSessions.token_hash, expectedHash));

    assert.ok(sessionRow, 'Session record must exist in user_sessions table');
    assert.strictEqual(sessionRow.user_id, adminUser.id, 'Session must reference user_id');
    assert.strictEqual(sessionRow.csrf_secret, loginResult.csrfSecret, 'Session must store CSRF secret');
    assert.strictEqual(sessionRow.ip_address, '192.168.1.100', 'Session must store IP');
    assert.strictEqual(sessionRow.user_agent, 'Mozilla/5.0 TestSuite', 'Session must store User-Agent');
    assert.strictEqual(sessionRow.is_revoked, false, 'is_revoked must be false on creation');
    console.log('✓ 2. Session row persisted correctly in database.');

    // 3. Stored token hash equals SHA-256 hash of the raw token
    assert.strictEqual(sessionRow.token_hash, expectedHash, 'Stored token_hash must match sha256(rawToken)');
    console.log('✓ 3. Stored token hash precisely matches SHA-256 digest of raw session token.');

    // 4. Raw token is not stored in the database
    const allSessions = await db.select().from(schema.userSessions);
    for (const s of allSessions) {
      assert.notStrictEqual(s.token_hash, loginResult.rawToken, 'Database must not contain raw token in token_hash');
      assert.notStrictEqual(s.csrf_secret, loginResult.rawToken, 'Database must not contain raw token in csrf_secret');
    }
    console.log('✓ 4. Raw session token is never stored anywhere in the database.');

    // 5 - 8. Credential errors & Generic error behavior
    console.log('\n--- 5 - 8. Testing Credential Failure & Generic Errors ---');
    const GENERIC_MSG = 'Invalid username or password';

    // 5. Wrong password
    let wrongPassErr: any = null;
    try {
      await login(db, 'TestAdmin', 'IncorrectPassword123!');
    } catch (e) {
      wrongPassErr = e;
    }
    assert.ok(wrongPassErr instanceof ValidationError, 'Wrong password must throw ValidationError');
    assert.strictEqual(wrongPassErr.message, GENERIC_MSG, 'Wrong password must return generic error message');
    console.log('✓ 5. Wrong password rejected with generic ValidationError.');

    // 6. Unknown username
    let unknownUserErr: any = null;
    try {
      await login(db, 'NonExistentUser', adminPassword);
    } catch (e) {
      unknownUserErr = e;
    }
    assert.ok(unknownUserErr instanceof ValidationError, 'Unknown username must throw ValidationError');
    assert.strictEqual(unknownUserErr.message, GENERIC_MSG, 'Unknown username must return generic error message');
    console.log('✓ 6. Unknown username rejected with generic ValidationError.');

    // 7. Inactive account
    // Create an inactive user for testing
    const [inactiveUser] = await db
      .insert(schema.userAccounts)
      .values({
        username: 'inactive_staff',
        password_hash: '$2b$12$e80vXFv.C28zPjL/7aK45O0B8P5Y8rI.bQ8U2p7V2Q6n9Y8q8w8e.', // dummy bcrypt
        role: 'FACULTY',
        is_active: false,
      })
      .returning();

    let inactiveErr: any = null;
    try {
      await login(db, 'inactive_staff', 'AnyPassword123!');
    } catch (e) {
      inactiveErr = e;
    }
    assert.ok(inactiveErr instanceof ValidationError, 'Inactive account must throw ValidationError');
    assert.strictEqual(inactiveErr.message, GENERIC_MSG, 'Inactive account must return generic error message');
    console.log('✓ 7. Inactive account rejected with generic ValidationError.');

    // 8. Generic credential error behaviour (no enumeration)
    assert.strictEqual(wrongPassErr.message, unknownUserErr.message);
    assert.strictEqual(unknownUserErr.message, inactiveErr.message);
    console.log('✓ 8. Identical generic error message returned across all failure scenarios (no account enumeration).');

    // 9 - 10. Logout & Idempotency
    console.log('\n--- 9 - 10. Testing Logout Service & Idempotency ---');
    // 9. Successful logout and session revocation
    await logout(db, loginResult.rawToken);
    const [revokedSession] = await db
      .select()
      .from(schema.userSessions)
      .where(eq(schema.userSessions.token_hash, expectedHash));

    assert.ok(revokedSession, 'Session row must still exist after logout');
    assert.strictEqual(revokedSession.is_revoked, true, 'is_revoked must be true after logout');
    console.log('✓ 9. Logout successfully set is_revoked = true for the authenticated session.');

    // 10. Idempotent logout
    await assert.doesNotReject(
      async () => logout(db, loginResult.rawToken),
      'Repeated logout with already-revoked token must not throw'
    );
    await assert.doesNotReject(
      async () => logout(db, 'nonexistent_token_string_12345678901234567890'),
      'Logout with non-existent token must not throw'
    );
    console.log('✓ 10. Logout is fully idempotent; repeated or non-existent token calls succeed silently.');

    // 11 - 17. HTTP Route Testing (Origin Validation, Response & Cookie Behavior)
    console.log('\n--- 11 - 17. Testing HTTP Routes, Origin Validation & Cookies ---');
    const authRouter = createAuthRouter(db);
    const dispatch = createMockDispatcher(authRouter);

    // 11. Matching Origin accepted
    const validLoginRes = await dispatch({
      method: 'POST',
      path: '/login',
      headers: {
        origin: env.CLIENT_ORIGIN,
      },
      body: {
        username: 'TestAdmin',
        password: adminPassword,
      },
    });

    assert.strictEqual(validLoginRes.status, 200, 'Matching Origin and valid credentials must return 200');
    assert.strictEqual(validLoginRes.body.message, 'Login successful');
    assert.strictEqual(validLoginRes.body.user.username, 'TestAdmin');
    assert.strictEqual(typeof validLoginRes.body.csrfToken, 'string');
    assert.strictEqual(validLoginRes.body.csrfToken.length, 64);
    console.log('✓ 11. Matching Origin header accepted and returned HTTP 200.');

    // 12. Mismatched Origin rejected with 403
    const mismatchedOriginRes = await dispatch({
      method: 'POST',
      path: '/login',
      headers: {
        origin: 'https://malicious-attacker.com',
      },
      body: {
        username: 'TestAdmin',
        password: adminPassword,
      },
    });

    assert.strictEqual(mismatchedOriginRes.status, 403, 'Mismatched Origin must return HTTP 403');
    assert.strictEqual(mismatchedOriginRes.body.error, 'Request origin not permitted');
    console.log('✓ 12. Mismatched Origin rejected with HTTP 403.');

    // 13. Missing Origin rejected with 403
    const missingOriginRes = await dispatch({
      method: 'POST',
      path: '/login',
      headers: {}, // No Origin header
      body: {
        username: 'TestAdmin',
        password: adminPassword,
      },
    });

    assert.strictEqual(missingOriginRes.status, 403, 'Missing Origin must return HTTP 403');
    assert.strictEqual(missingOriginRes.body.error, 'Request origin not permitted');
    console.log('✓ 13. Missing Origin rejected with HTTP 403.');

    // 14. Origin validation occurs before credential verification
    // Send invalid credentials and empty body with mismatched origin; must still get 403, not 400 or 401
    const originPrecedenceRes = await dispatch({
      method: 'POST',
      path: '/login',
      headers: {
        origin: 'http://unauthorized.domain',
      },
      body: {}, // Invalid empty body
    });

    assert.strictEqual(
      originPrecedenceRes.status,
      403,
      'Origin check must take precedence over body/credential validation'
    );
    console.log('✓ 14. Origin validation runs before body parsing or credential verification.');

    // 15. Login response does not expose raw session token in body
    assert.strictEqual(
      validLoginRes.body.rawToken,
      undefined,
      'Response body must NOT contain rawToken'
    );
    assert.strictEqual(
      validLoginRes.body.token,
      undefined,
      'Response body must NOT contain token'
    );
    assert.strictEqual(
      validLoginRes.body.tokenHash,
      undefined,
      'Response body must NOT contain tokenHash'
    );
    assert.strictEqual(
      validLoginRes.body.user.password_hash,
      undefined,
      'Response body must NOT contain password_hash'
    );
    console.log('✓ 15. Response JSON body does not expose raw session token or password hash.');

    // 16. Login sets the correct secure cookie
    assert.strictEqual(validLoginRes.setCookies.length, 1, 'Exactly one cookie must be set on login');
    const sessionCookie = validLoginRes.setCookies[0];
    assert.strictEqual(sessionCookie.name, SESSION_COOKIE_NAME, `Cookie name must be ${SESSION_COOKIE_NAME}`);
    assert.strictEqual(typeof sessionCookie.val, 'string');
    assert.strictEqual(sessionCookie.val.length, 64, 'Cookie value must be the 64-character raw token');
    assert.strictEqual(sessionCookie.options.httpOnly, true, 'Cookie options must specify httpOnly: true');
    assert.strictEqual(sessionCookie.options.sameSite, 'strict', 'Cookie options must specify sameSite: strict');
    assert.strictEqual(sessionCookie.options.path, '/', 'Cookie path must be /');
    assert.strictEqual(sessionCookie.options.maxAge, 86400 * 1000, 'Cookie maxAge must be 86,400,000 ms');
    console.log('✓ 16. Login set the correct HttpOnly, SameSite=Strict cookie with 24h maxAge.');

    // 17. Logout clears the correct cookie (requires valid session cookie and CSRF token)
    const logoutRes = await dispatch({
      method: 'POST',
      path: '/logout',
      headers: {
        'x-csrf-token': validLoginRes.body.csrfToken,
      },
      cookies: {
        [SESSION_COOKIE_NAME]: sessionCookie.val,
      },
    });

    assert.strictEqual(logoutRes.status, 200, 'Logout must return HTTP 200');
    assert.strictEqual(logoutRes.clearedCookies.length, 1, 'Logout must clear session cookie');
    const cleared = logoutRes.clearedCookies[0];
    assert.strictEqual(cleared.name, SESSION_COOKIE_NAME, 'Cleared cookie name must match session cookie');
    assert.strictEqual(cleared.options.path, '/', 'Cleared cookie path must be /');
    assert.strictEqual(cleared.options.httpOnly, true, 'Cleared cookie httpOnly must match');
    assert.strictEqual(cleared.options.sameSite, 'strict', 'Cleared cookie sameSite must match');

    // Verify session row is revoked in database
    const loggedOutHash = hashToken(sessionCookie.val);
    const [postLogoutRow] = await db
      .select()
      .from(schema.userSessions)
      .where(eq(schema.userSessions.token_hash, loggedOutHash));
    assert.ok(postLogoutRow);
    assert.strictEqual(postLogoutRow.is_revoked, true, 'Session in DB must be revoked after logout route call');
    console.log('✓ 17. Logout cleared the session cookie and revoked the session in the database.');

    console.log('\n[Auth Service Test Suite] All 17 assertions passed successfully.');
  } finally {
    await pglite.close();
  }
}

runAuthServiceTestSuite().catch((err) => {
  console.error('[Auth Service Test Suite] FAILED:', err);
  process.exit(1);
});
