import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import { setupAdmin } from '../src/auth/setup.service.js';
import { login } from '../src/auth/auth.service.js';
import { hashToken, generateSessionToken } from '../src/auth/token.js';
import { SESSION_COOKIE_NAME } from '../src/auth/cookie.js';
import { createAuthenticateMiddleware } from '../src/middleware/authenticate.js';
import { requireRole } from '../src/middleware/requireRole.js';
import { csrfGuard } from '../src/middleware/csrfGuard.js';
import { createAuthRouter } from '../src/auth/auth.routes.js';

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

function createMockReqRes(options: {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: any;
  cookies?: Record<string, string>;
  locals?: Record<string, any>;
  onEnd?: (result: {
    status: number;
    body: any;
    setCookies: Array<{ name: string; val: string; options: any }>;
    clearedCookies: Array<{ name: string; options: any }>;
  }) => void;
}) {
  let statusCode = 200;
  let responseBody: any = null;
  let nextCalled = false;
  let nextError: any = null;
  let ended = false;
  const setCookies: Array<{ name: string; val: string; options: any }> = [];
  const clearedCookies: Array<{ name: string; options: any }> = [];

  const normalizedHeaders: Record<string, string> = {};
  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      normalizedHeaders[k.toLowerCase()] = v;
    }
  }

  const req: any = {
    method: options.method ?? 'GET',
    url: options.path ?? '/',
    path: options.path ?? '/',
    headers: normalizedHeaders,
    body: options.body ?? {},
    cookies: options.cookies ?? {},
    ip: '127.0.0.1',
  };

  const triggerEnd = () => {
    if (!ended) {
      ended = true;
      if (options.onEnd) {
        options.onEnd({
          status: statusCode,
          body: responseBody,
          setCookies,
          clearedCookies,
        });
      }
    }
  };

  const res: any = {
    locals: options.locals ?? {},
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: any) {
      responseBody = data;
      triggerEnd();
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

  const next = (err?: any) => {
    nextCalled = true;
    nextError = err;
  };

  return {
    req,
    res,
    next,
    wasNextCalled: () => nextCalled,
    getNextError: () => nextError,
    getStatus: () => statusCode,
    getBody: () => responseBody,
    getSetCookies: () => setCookies,
    getClearedCookies: () => clearedCookies,
  };
}

function createMockDispatcher(router: any) {
  return async function dispatch(options: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    headers?: Record<string, string>;
    body?: any;
    cookies?: Record<string, string>;
  }) {
    const normalizedHeaders: Record<string, string> = {};
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        normalizedHeaders[k.toLowerCase()] = v;
      }
    }

    return new Promise<{
      status: number;
      body: any;
      setCookies: Array<{ name: string; val: string; options: any }>;
      clearedCookies: Array<{ name: string; options: any }>;
    }>((resolve, reject) => {
      let resolved = false;
      const onEnd = (result: any) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      };

      const { req, res, getStatus, getBody, getSetCookies, getClearedCookies } = createMockReqRes({
        method: options.method,
        path: options.path,
        headers: normalizedHeaders,
        body: options.body,
        cookies: options.cookies,
        onEnd,
      });

      try {
        router.handle(req, res, (err: any) => {
          if (err) {
            reject(err);
          } else if (!resolved) {
            resolved = true;
            resolve({
              status: getStatus(),
              body: getBody(),
              setCookies: getSetCookies(),
              clearedCookies: getClearedCookies(),
            });
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  };
}

async function runAuthMiddlewareTestSuite(): Promise<void> {
  console.log('[Auth Middleware Test Suite] Initializing in-memory database...');
  const { pglite, db } = await setupTestDb();

  try {
    // 1. Seed admin and create active session
    const adminUser = await setupAdmin(db, 'SecurityAdmin', 'SuperSecretPass123!');
    const activeLogin = await login(db, 'SecurityAdmin', 'SuperSecretPass123!');
    const rawToken = activeLogin.rawToken;
    const csrfSecret = activeLogin.csrfSecret;

    const authenticate = createAuthenticateMiddleware(db);

    console.log('\n--- 1 - 6. Testing Session Authenticate Middleware ---');

    // 1. Valid session authentication
    const validAuth = createMockReqRes({
      cookies: { [SESSION_COOKIE_NAME]: rawToken },
    });
    await authenticate(validAuth.req, validAuth.res, validAuth.next);

    assert.strictEqual(validAuth.wasNextCalled(), true, 'Valid token must call next()');
    assert.strictEqual(validAuth.res.locals.user.id, adminUser.id);
    assert.strictEqual(validAuth.res.locals.user.username, 'SecurityAdmin');
    assert.strictEqual(validAuth.res.locals.user.role, 'ADMIN');
    assert.strictEqual(validAuth.res.locals.user.csrf_secret, csrfSecret);
    assert.strictEqual(validAuth.res.locals.user.password_hash, undefined, 'Must not expose password hash');
    assert.strictEqual(validAuth.res.locals.user.rawToken, undefined, 'Must not expose raw token');
    console.log('✓ 1. Valid session authenticated successfully; res.locals.user populated safely.');

    // 2. Missing cookie
    const missingCookie = createMockReqRes({ cookies: {} });
    await authenticate(missingCookie.req, missingCookie.res, missingCookie.next);
    assert.strictEqual(missingCookie.wasNextCalled(), false, 'Missing cookie must not call next()');
    assert.strictEqual(missingCookie.getStatus(), 401);
    assert.strictEqual(missingCookie.getBody().error, 'Authentication required');
    console.log('✓ 2. Missing cookie rejected with HTTP 401.');

    // 3. Invalid token (non-existent session)
    const nonExistentToken = generateSessionToken();
    const invalidAuth = createMockReqRes({
      cookies: { [SESSION_COOKIE_NAME]: nonExistentToken },
    });
    await authenticate(invalidAuth.req, invalidAuth.res, invalidAuth.next);
    assert.strictEqual(invalidAuth.wasNextCalled(), false);
    assert.strictEqual(invalidAuth.getStatus(), 401);
    assert.strictEqual(invalidAuth.getBody().error, 'Authentication required');
    console.log('✓ 3. Non-existent token hash rejected with HTTP 401.');

    // 4. Expired session
    const expiredRawToken = generateSessionToken();
    const expiredTokenHash = hashToken(expiredRawToken);
    await db.insert(schema.userSessions).values({
      user_id: adminUser.id,
      token_hash: expiredTokenHash,
      csrf_secret: generateSessionToken(),
      expires_at: new Date(Date.now() - 10000), // 10 seconds in past
      is_revoked: false,
    });

    const expiredAuth = createMockReqRes({
      cookies: { [SESSION_COOKIE_NAME]: expiredRawToken },
    });
    await authenticate(expiredAuth.req, expiredAuth.res, expiredAuth.next);
    assert.strictEqual(expiredAuth.wasNextCalled(), false);
    assert.strictEqual(expiredAuth.getStatus(), 401);
    assert.strictEqual(expiredAuth.getBody().error, 'Authentication required');
    console.log('✓ 4. Expired session rejected with HTTP 401.');

    // 5. Revoked session
    const revokedRawToken = generateSessionToken();
    const revokedTokenHash = hashToken(revokedRawToken);
    await db.insert(schema.userSessions).values({
      user_id: adminUser.id,
      token_hash: revokedTokenHash,
      csrf_secret: generateSessionToken(),
      expires_at: new Date(Date.now() + 86400000),
      is_revoked: true, // Marked revoked
    });

    const revokedAuth = createMockReqRes({
      cookies: { [SESSION_COOKIE_NAME]: revokedRawToken },
    });
    await authenticate(revokedAuth.req, revokedAuth.res, revokedAuth.next);
    assert.strictEqual(revokedAuth.wasNextCalled(), false);
    assert.strictEqual(revokedAuth.getStatus(), 401);
    assert.strictEqual(revokedAuth.getBody().error, 'Authentication required');
    console.log('✓ 5. Revoked session rejected with HTTP 401.');

    // 6. Inactive user account
    const [inactiveUser] = await db
      .insert(schema.userAccounts)
      .values({
        username: 'deactivated_user',
        password_hash: '$2b$12$e80vXFv.C28zPjL/7aK45O0B8P5Y8rI.bQ8U2p7V2Q6n9Y8q8w8e.',
        role: 'FACULTY',
        is_active: false,
      })
      .returning();

    const inactiveRawToken = generateSessionToken();
    const inactiveTokenHash = hashToken(inactiveRawToken);
    await db.insert(schema.userSessions).values({
      user_id: inactiveUser.id,
      token_hash: inactiveTokenHash,
      csrf_secret: generateSessionToken(),
      expires_at: new Date(Date.now() + 86400000),
      is_revoked: false,
    });

    const inactiveAuth = createMockReqRes({
      cookies: { [SESSION_COOKIE_NAME]: inactiveRawToken },
    });
    await authenticate(inactiveAuth.req, inactiveAuth.res, inactiveAuth.next);
    assert.strictEqual(inactiveAuth.wasNextCalled(), false);
    assert.strictEqual(inactiveAuth.getStatus(), 401);
    assert.strictEqual(inactiveAuth.getBody().error, 'Authentication required');
    console.log('✓ 6. Session for inactive user account rejected with HTTP 401.');

    console.log('\n--- 7 - 8. Testing /me Route ---');
    const authRouter = createAuthRouter(db);
    const dispatch = createMockDispatcher(authRouter);

    // 7. /me with valid authentication
    const meValid = await dispatch({
      method: 'GET',
      path: '/me',
      cookies: { [SESSION_COOKIE_NAME]: rawToken },
    });
    assert.strictEqual(meValid.status, 200);
    assert.strictEqual(meValid.body.user.id, adminUser.id);
    assert.strictEqual(meValid.body.user.username, 'SecurityAdmin');
    assert.strictEqual(meValid.body.user.role, 'ADMIN');
    assert.strictEqual(meValid.body.user.password_hash, undefined);
    console.log('✓ 7. GET /api/v1/auth/me returns authenticated user details.');

    // 8. /me without authentication
    const meInvalid = await dispatch({
      method: 'GET',
      path: '/me',
      cookies: {},
    });
    assert.strictEqual(meInvalid.status, 401);
    assert.strictEqual(meInvalid.body.error, 'Authentication required');
    console.log('✓ 8. GET /api/v1/auth/me without cookie returns HTTP 401.');

    console.log('\n--- 9 - 10. Testing requireRole Guard ---');
    const adminGuard = requireRole('ADMIN');
    const hodGuard = requireRole('HOD');

    // 9. Admin role authorization
    const adminReqRes = createMockReqRes({
      locals: {
        user: { id: adminUser.id, username: 'admin', role: 'ADMIN' },
      },
    });
    adminGuard(adminReqRes.req, adminReqRes.res, adminReqRes.next);
    assert.strictEqual(adminReqRes.wasNextCalled(), true, 'requireRole(ADMIN) must allow ADMIN user');
    console.log('✓ 9. requireRole("ADMIN") permits user with ADMIN role.');

    // 10. Default-deny HOD / Faculty permissions
    const hodReqRes = createMockReqRes({
      locals: {
        user: { id: adminUser.id, username: 'admin', role: 'ADMIN' },
      },
    });
    hodGuard(hodReqRes.req, hodReqRes.res, hodReqRes.next);
    assert.strictEqual(hodReqRes.wasNextCalled(), false, 'requireRole(HOD) must block ADMIN');
    assert.strictEqual(hodReqRes.getStatus(), 403);
    assert.strictEqual(hodReqRes.getBody().error, 'Forbidden');

    const facultyUserReqRes = createMockReqRes({
      locals: {
        user: { id: 'faculty-id', username: 'faculty', role: 'FACULTY' },
      },
    });
    adminGuard(facultyUserReqRes.req, facultyUserReqRes.res, facultyUserReqRes.next);
    assert.strictEqual(facultyUserReqRes.wasNextCalled(), false);
    assert.strictEqual(facultyUserReqRes.getStatus(), 403);
    console.log('✓ 10. Default-deny strictly enforced: unauthorized roles rejected with HTTP 403.');

    console.log('\n--- 11 - 14. Testing Synchronizer Token Pattern csrfGuard ---');
    const testSecret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    // 11. Missing X-CSRF-Token on state-changing request (POST)
    const missingCsrf = createMockReqRes({
      method: 'POST',
      headers: {},
      locals: { user: { csrf_secret: testSecret } },
    });
    csrfGuard(missingCsrf.req, missingCsrf.res, missingCsrf.next);
    assert.strictEqual(missingCsrf.wasNextCalled(), false);
    assert.strictEqual(missingCsrf.getStatus(), 403);
    assert.strictEqual(missingCsrf.getBody().error, 'Invalid CSRF token');
    console.log('✓ 11. Missing X-CSRF-Token on POST rejected with HTTP 403.');

    // 12. Incorrect X-CSRF-Token
    const wrongCsrf = createMockReqRes({
      method: 'POST',
      headers: { 'x-csrf-token': 'wrong_or_mismatched_csrf_token' },
      locals: { user: { csrf_secret: testSecret } },
    });
    csrfGuard(wrongCsrf.req, wrongCsrf.res, wrongCsrf.next);
    assert.strictEqual(wrongCsrf.wasNextCalled(), false);
    assert.strictEqual(wrongCsrf.getStatus(), 403);
    assert.strictEqual(wrongCsrf.getBody().error, 'Invalid CSRF token');
    console.log('✓ 12. Mismatched X-CSRF-Token on POST rejected with HTTP 403.');

    // 13. Matching X-CSRF-Token passes
    const validCsrf = createMockReqRes({
      method: 'POST',
      headers: { 'x-csrf-token': testSecret },
      locals: { user: { csrf_secret: testSecret } },
    });
    csrfGuard(validCsrf.req, validCsrf.res, validCsrf.next);
    assert.strictEqual(validCsrf.wasNextCalled(), true);
    console.log('✓ 13. Matching X-CSRF-Token on POST passes csrfGuard.');

    // 14. Safe HTTP methods exempt from CSRF validation
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const safeReqRes = createMockReqRes({
        method,
        headers: {}, // No CSRF token
        locals: { user: { csrf_secret: testSecret } },
      });
      csrfGuard(safeReqRes.req, safeReqRes.res, safeReqRes.next);
      assert.strictEqual(safeReqRes.wasNextCalled(), true, `${method} must bypass csrfGuard`);
    }
    console.log('✓ 14. Safe HTTP methods (GET, HEAD, OPTIONS) are exempt from CSRF verification.');

    console.log('\n--- 15 - 17. Testing Protected POST /logout Route ---');

    // 15. Logout requires authentication (missing cookie)
    const unauthLogout = await dispatch({
      method: 'POST',
      path: '/logout',
      cookies: {},
    });
    assert.strictEqual(unauthLogout.status, 401, 'Unauthenticated logout must return 401');
    console.log('✓ 15. POST /logout without session cookie rejected with HTTP 401.');

    // 16. Logout requires valid CSRF token
    const noCsrfLogout = await dispatch({
      method: 'POST',
      path: '/logout',
      cookies: { [SESSION_COOKIE_NAME]: rawToken },
      headers: {}, // Missing CSRF token
    });
    assert.strictEqual(noCsrfLogout.status, 403, 'Logout without CSRF token must return 403');
    assert.strictEqual(noCsrfLogout.body.error, 'Invalid CSRF token');

    const badCsrfLogout = await dispatch({
      method: 'POST',
      path: '/logout',
      cookies: { [SESSION_COOKIE_NAME]: rawToken },
      headers: { 'x-csrf-token': 'wrong-token' },
    });
    assert.strictEqual(badCsrfLogout.status, 403, 'Logout with wrong CSRF token must return 403');
    console.log('✓ 16. POST /logout with missing or incorrect CSRF token rejected with HTTP 403.');

    // 17. Logout revokes session and clears cookie
    const validLogout = await dispatch({
      method: 'POST',
      path: '/logout',
      cookies: { [SESSION_COOKIE_NAME]: rawToken },
      headers: { 'x-csrf-token': csrfSecret },
    });
    assert.strictEqual(validLogout.status, 200, 'Authenticated logout with valid CSRF token returns 200');
    assert.strictEqual(validLogout.clearedCookies.length, 1, 'Session cookie must be cleared on logout');

    // Verify database record has is_revoked = true
    const targetHash = hashToken(rawToken);
    const [revokedRow] = await db
      .select()
      .from(schema.userSessions)
      .where(eq(schema.userSessions.token_hash, targetHash));
    assert.ok(revokedRow);
    assert.strictEqual(revokedRow.is_revoked, true, 'Target session must be revoked in DB');
    console.log('✓ 17. POST /logout with valid session & CSRF token revoked session in DB and cleared cookie.');

    console.log('\n[Auth Middleware Test Suite] All 17 assertions passed successfully.');
  } finally {
    await pglite.close();
  }
}

runAuthMiddlewareTestSuite().catch((err) => {
  console.error('[Auth Middleware Test Suite] FAILED:', err);
  process.exit(1);
});
