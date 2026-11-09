# Step 3: Authentication Foundation — Implementation Plan (Revised)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement secure Admin setup (CLI-only), login/logout, session-cookie authentication and middleware for Smart Campus (SmartTT) using the existing `user_accounts` and `user_sessions` schema.

**Architecture:** Shared auth utilities (token, password, csrf, cookie) are created first and imported by all higher layers. The first-run Admin account is created exclusively via a local CLI script (`backend/src/scripts/setup-admin.ts`) that runs on the server host — there is no publicly accessible setup endpoint. Login creates an opaque session token stored only as its SHA-256 hash; the raw token travels exclusively in an HttpOnly, SameSite=Strict cookie. Origin validation on the login route prevents cross-site login CSRF without requiring a pre-authentication token exchange. Session middleware reads the cookie, hashes it, looks up the session, and attaches the user to `res.locals` for downstream route handlers.

**Tech Stack:** Node.js 22 (ESM), Express 4, Drizzle ORM, `bcryptjs` (already installed), Node.js built-in `crypto` and `readline`, `cookie-parser` (to be installed — see Task 1 justification), TypeScript 5, PGlite (tests), `tsx` (test runner and CLI script runner).

**Spec:** `docs/superpowers/plans/2026-11-09-step3-authentication-foundation.md` (this file)

## Global Constraints

- No JWT. Session tokens are opaque random bytes; only their SHA-256 hash is stored.
- No default Admin credentials. The CLI setup command is the only Admin creation path.
- No publicly accessible Admin setup HTTP endpoint. `setup.routes.ts` is not created.
- Role `HOD` and `FACULTY` are default-deny for all routes in this step.
- bcryptjs work factor: exactly `12` (constant `BCRYPT_SALT_ROUNDS = 12`).
- Do NOT install `@types/bcryptjs` — bcryptjs ships its own `index.d.ts`.
- Session lifetime: `24 * 60 * 60` seconds (86 400 s). Stored as `expires_at` timestamp.
- Cookie flags: `httpOnly: true`, `sameSite: 'strict'`, `secure: true` in production, `path: '/'`.
- CSRF strategy:
  - **Post-login (authenticated) state mutations — Synchronizer Token Pattern:** A cryptographically random `csrf_secret` (32 bytes hex-encoded, 64 hex chars) is generated at session creation and stored server-side in the `user_sessions` table. It is returned exclusively to the authenticated user in the JSON response upon login and never exposed in logs. On state-mutating requests (POST, PATCH, DELETE, PUT), the client sends this value in the `X-CSRF-Token` header. The `csrfGuard` middleware compares `req.headers['x-csrf-token']` against `res.locals.user.csrf_secret` (loaded from the authenticated session). If missing or mismatched, the request is rejected with HTTP 403. Safe HTTP methods (`GET`, `HEAD`, `OPTIONS`) are exempt. No additional CSRF cookie or third-party dependency is introduced.
  - **Login route (pre-authentication):** strict `Origin` header validation. If the `Origin` header is **absent** or does not equal `env.CLIENT_ORIGIN`, the request is rejected with `403`. Browser-based login requests always include an `Origin` header; a missing or mismatched header indicates the request did not originate from the approved client. This is stateless, requires no extra round-trip, and is compatible with `SameSite=Strict` as a defence-in-depth layer. If non-browser (server-to-server) authentication is ever required, it must be designed as a separate, explicitly approved mechanism (e.g., a dedicated API-key-based endpoint) — it is never silently permitted through the browser login route.
- All tests use isolated in-memory PGlite instances. No network, no production DB.
- `BypassSandbox: true` required only for `npm install` (network-blocked sandbox rule).
- AGENTS.md and GEMINI.md must remain untracked in Git at all times.
- Do not modify any approved schema (`schema.ts`) or migration SQL.
- Do not create HOD/FACULTY CRUD, master-data APIs, or timetable functionality.

## Why `SameSite=Strict` and `Origin` validation together cover login CSRF

`SameSite=Strict` means the session cookie is never sent on cross-site requests, so a forged post-login request cannot carry a valid session. However, the login request itself happens before a session cookie exists. An attacker who can forge a login form submission on behalf of a victim could log the victim into the attacker's account (login CSRF / session fixation). `SameSite=Strict` prevents this in modern browsers because the forged submission is a cross-site request and browsers will not attach the cookie — but since there is no session cookie yet on login, `SameSite` alone does not block a cross-site login form POST.

`Origin` validation closes this gap: browsers always include an `Origin` header on cross-origin POST requests, and also on same-site POST requests (as of recent browser behaviour). The server rejects any request whose `Origin` is absent (not a recognised browser-initiated request) or does not match `CLIENT_ORIGIN` exactly. Combined with `SameSite=Strict` on the resulting session cookie, this gives full CSRF coverage across the entire auth lifecycle without a pre-authentication token exchange and without silently accepting non-browser requests.

## Review Focus

1. **Revoked token reuse** — a session revoked by logout must not authenticate any subsequent request, even before the expiry timestamp.
2. **Simultaneous first-run setup** — if two operator processes run the CLI setup command concurrently on an empty database, exactly one must succeed and one must fail with a conflict error. The service must acquire a transaction-scoped advisory lock before checking for an existing ADMIN, so that the lock + count + insert sequence is serialized at the database level even under PostgreSQL READ COMMITTED isolation.
3. **Username case collision** — lookup uses `LOWER(username)`; two accounts with `Admin` and `admin` must be impossible even across concurrent calls.
4. **Session clock skew** — a session whose `expires_at` equals `NOW()` exactly must be treated as expired (use `> NOW()`, not `>= NOW()`).
5. **Login Origin bypass** — a request to `POST /auth/login` with an `Origin` header that does not match `CLIENT_ORIGIN`, or with a **missing** `Origin` header, must be rejected with 403 before any credential check.

---

## Task 1: Install `cookie-parser` and Shared Auth Utilities

**Justification for `cookie-parser`:** Express does not parse `Cookie` headers natively. `cookie-parser` is the standard, minimal (zero-extra-dependency) package for this. The alternative (manual `req.headers.cookie` parsing) is brittle and error-prone. No other dependency is introduced in this task.

**Files:**
- Install: `cookie-parser` + `@types/cookie-parser` (dev)
- Create: `backend/src/auth/token.ts`
- Create: `backend/src/auth/password.ts`
- Create: `backend/src/auth/csrf.ts`
- Create: `backend/src/auth/cookie.ts`
- Create: `backend/tests/auth-utils.test.ts`

**Interfaces:**
- Produces:
  - `generateSessionToken(): string` — returns hex-encoded 32-byte random string (64 hex chars)
  - `hashToken(raw: string): string` — returns hex-encoded SHA-256 (64 hex chars)
  - `sessionExpiresAt(): Date` — returns `new Date(Date.now() + 86400 * 1000)`
  - `SESSION_LIFETIME_SECONDS: number` — `86400`
  - `hashPassword(plain: string): Promise<string>` — bcrypt hash, rounds=12
  - `verifyPassword(plain: string, hash: string): Promise<boolean>` — bcrypt compare
  - `BCRYPT_SALT_ROUNDS: number` — `12`
  - `generateCsrfSecret(): string` — returns hex-encoded 32-byte random string (64 hex chars)
  - `buildCookieOptions(isProduction: boolean): express.CookieOptions` — returns `{ httpOnly: true, sameSite: 'strict', secure: isProduction, path: '/', maxAge: SESSION_LIFETIME_SECONDS }`

- [ ] **Step 1: Install cookie-parser** *(run with BypassSandbox: true)*

  ```
  npm --prefix backend install cookie-parser @types/cookie-parser
  ```
  Verify both appear in `backend/package.json` dependencies/devDependencies.

- [ ] **Step 2: Write the failing auth-utils test**

  File: `backend/tests/auth-utils.test.ts`

  ```typescript
  // Tests:
  // 1. generateSessionToken() returns a string of exactly 64 hex chars
  // 2. Two calls to generateSessionToken() return different values
  // 3. hashToken(raw) returns a 64-char lowercase hex string
  // 4. hashToken(raw) is deterministic: same input → same output
  // 5. hashPassword() returns a string starting with "$2b$12$"
  // 6. verifyPassword(plain, hash) resolves true for matching pair
  // 7. verifyPassword(plain, hash) resolves false for wrong plain
  // 8. generateCsrfSecret() returns exactly 64 hex chars
  // 9. Two calls to generateCsrfSecret() return different values
  // 10. buildCookieOptions(true).secure === true
  // 11. buildCookieOptions(false).secure === false
  // 12. buildCookieOptions(true).httpOnly === true
  // 13. buildCookieOptions(true).sameSite === 'strict'
  // 14. buildCookieOptions(true).maxAge === 86400
  // 15. sessionExpiresAt() returns a Date ~24h in the future (within 5s)
  ```

- [ ] **Step 3: Run test to verify it fails**

  ```
  npm --prefix backend run test:auth-utils
  ```
  Expected: FAIL — module not found or function not exported.

- [ ] **Step 4: Implement `backend/src/auth/token.ts`**

  Export `generateSessionToken`, `hashToken`, `sessionExpiresAt`, `SESSION_LIFETIME_SECONDS`.
  Use `crypto.randomBytes(32).toString('hex')` and `crypto.createHash('sha256').update(raw).digest('hex')`.

- [ ] **Step 5: Implement `backend/src/auth/password.ts`**

  Export `BCRYPT_SALT_ROUNDS = 12`, `hashPassword`, `verifyPassword`.
  Use `bcryptjs.hash` and `bcryptjs.compare`.

- [ ] **Step 6: Implement `backend/src/auth/csrf.ts`**

  Export `generateCsrfSecret`.
  Use `crypto.randomBytes(32).toString('hex')`.

- [ ] **Step 7: Implement `backend/src/auth/cookie.ts`**

  Export `buildCookieOptions(isProduction: boolean): express.CookieOptions`.
  Import `SESSION_LIFETIME_SECONDS` from `./token.js`.

- [ ] **Step 8: Add `test:auth-utils` script to `backend/package.json`**

  ```json
  "test:auth-utils": "tsx tests/auth-utils.test.ts"
  ```

- [ ] **Step 9: Run test to verify it passes**

  ```
  npm --prefix backend run test:auth-utils
  ```
  Expected: all 15 assertions PASS.

- [ ] **Step 10: Run TypeScript check**

  ```
  npm --prefix backend run check:types
  ```
  Expected: 0 errors.

- [ ] **Step 11: Commit**

  ```
  git add backend/src/auth/token.ts backend/src/auth/password.ts backend/src/auth/csrf.ts backend/src/auth/cookie.ts backend/tests/auth-utils.test.ts backend/package.json backend/package-lock.json
  git commit -m "feat(auth): add shared auth utilities — token, password, csrf, cookie"
  ```

---

## Task 2: First-Run Admin Setup — Service and CLI Script

The Admin account is created by a system operator running a CLI script directly on the server host. No HTTP route is exposed for setup. The service function is shared with the test suite.

**Atomicity guarantee & database-level serialization:**
In PostgreSQL under default `READ COMMITTED` isolation, a transaction containing only `SELECT COUNT(*)` followed by `INSERT` is susceptible to race conditions: two concurrent setup transactions could each observe `count === 0` simultaneously before either commits, resulting in duplicate initial Admin rows.

To guarantee absolute atomicity and prevent duplicate accounts during concurrent setup:
1. **Transaction-scoped advisory lock:** Inside the transaction, before querying for existing accounts, the service executes:
   `await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('smart_campus_admin_setup_lock'))`)`
2. **PostgreSQL behavior:** Any competing concurrent transaction attempting setup is blocked at the lock statement until the first transaction completes. When the first transaction commits, the lock is automatically released by PostgreSQL; the waiting transaction unblocks, executes its `SELECT COUNT(*)`, observes the newly committed Admin account (`count === 1`), and immediately aborts with `ConflictError('Admin account already exists')`.
3. **PGlite behavior:** PGlite is compiled directly from PostgreSQL C source and natively supports `pg_advisory_xact_lock` using the exact same SQL. Both adapters execute the identical query with zero behavioral differences or conditional branching.
4. **Concurrency verification:** An automated concurrency test executes two simultaneous setup invocations via `Promise.all` on an empty database, proving that exactly one succeeds and one rejects with `ConflictError`, leaving exactly one Admin record in `user_accounts`.

**Files:**
- Create: `backend/src/auth/setup.service.ts`
- Create: `backend/src/scripts/setup-admin.ts`
- Create: `backend/tests/auth-setup.test.ts`
- Modify: `backend/package.json` — add `setup:admin` script

**Interfaces:**
- Consumes:
  - `hashPassword(plain: string): Promise<string>` from `../auth/password.js`
  - `userAccounts` table from `../db/schema.js`
  - `DatabaseExecutor` from `../db/client.js`
  - `ConflictError`, `ValidationError` from `../errors/app.errors.js`
- Produces:
  - `setupAdmin(db: DatabaseExecutor, username: string, password: string): Promise<{ id: string; username: string; role: string }>` — creates the first ADMIN account inside a transaction; throws `ConflictError('Admin account already exists')` if any ADMIN row exists; throws `ValidationError` if inputs fail rules.
  - CLI entry point: `backend/src/scripts/setup-admin.ts` — reads `username` and `password` from interactive prompts (using Node.js `readline`), calls `setupAdmin`, prints result, exits.
  - `npm --prefix backend run setup:admin` — the documented operator command.

**Input validation rules (enforced in service):**
- `username`: 3–50 chars, only `[a-zA-Z0-9_]`
- `password`: minimum 8 characters

> **Security note:** The CLI script reads the password interactively so it is never passed as a shell argument and does not appear in process lists or shell history.

- [ ] **Step 1: Write the failing auth-setup test**

  File: `backend/tests/auth-setup.test.ts`

  ```typescript
  // Uses in-memory PGlite + migration (same pattern as services.test.ts).
  // Tests:
  // 1. First call to setupAdmin() with valid inputs inserts one row in user_accounts
  //    with role = 'ADMIN' and is_active = true
  // 2. Returned object has { id, username: 'testadmin', role: 'ADMIN' }
  // 3. Second call to setupAdmin() on the same db throws ConflictError
  //    with message containing "already exists"
  //    and no second row is inserted (count remains 1)
  // 4. setupAdmin() with username shorter than 3 chars throws ValidationError
  //    before touching the database
  // 5. setupAdmin() with password shorter than 8 chars throws ValidationError
  //    before touching the database
  // 6. setupAdmin() with username containing a space throws ValidationError
  //    before touching the database
  // 7. setupAdmin() with username containing a special char (e.g. '@') throws ValidationError
  //    before touching the database
  // 8. After a failed ValidationError call, the database still has 0 ADMIN rows
  // 9. Concurrency test: execute Promise.all([setupAdmin(db, 'admin1', 'Pass12345'), setupAdmin(db, 'admin2', 'Pass12345')])
  //    on an empty database; exactly one promise resolves successfully and one rejects with ConflictError;
  //    the user_accounts table contains exactly 1 row with role = 'ADMIN'
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```
  npm --prefix backend run test:auth-setup
  ```
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/auth/setup.service.ts`**

  Signature: `export async function setupAdmin(db: DatabaseExecutor, username: string, password: string): Promise<{ id: string; username: string; role: string }>`

  Logic:
  1. Validate `username` (3–50 chars, `/^[a-zA-Z0-9_]+$/`) and `password` (min 8 chars). Throw `ValidationError` on failure — before any DB access.
  2. Run inside `db.transaction(async (tx) => { ... })`:
     a. Acquire transaction-scoped advisory lock: `await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('smart_campus_admin_setup_lock'))`)`.
     b. Count existing rows: `tx.select({ count: sql<number>`cast(count(*) as int)` }).from(userAccounts).where(eq(userAccounts.role, 'ADMIN'))`.
     c. If `count > 0`, throw `ConflictError('Admin account already exists')`.
     d. Hash password with `hashPassword(password)`.
     e. Insert row: `role: 'ADMIN'`, `is_active: true`, `faculty_id: null`.
     f. Return `{ id, username, role }` from inserted row.

- [ ] **Step 4: Implement `backend/src/scripts/setup-admin.ts`**

  CLI entry point. Must:
  1. Import `createDatabaseAdapter` and call `adapter.connect()`.
  2. Import `setupAdmin` from `../auth/setup.service.js`.
  3. Use Node.js `readline` to prompt for `username` (echoed) and `password` (use `rl.stdoutMuted = true` / override `_writeToOutput` to suppress echo).
  4. Call `setupAdmin(adapter.db, username, password)`.
  5. On success: print `Admin account created: <username>` and `adapter.disconnect()` and `process.exit(0)`.
  6. On `ConflictError`: print the error message, `process.exit(1)`.
  7. On `ValidationError`: print the error message, `process.exit(1)`.
  8. On unexpected error: print `Unexpected error: <message>`, `process.exit(1)`.

- [ ] **Step 5: Add scripts to `backend/package.json`**

  ```json
  "setup:admin": "tsx src/scripts/setup-admin.ts",
  "test:auth-setup": "tsx tests/auth-setup.test.ts"
  ```

- [ ] **Step 6: Run test to verify it passes**

  ```
  npm --prefix backend run test:auth-setup
  ```
  Expected: all 9 assertions PASS.

- [ ] **Step 7: Run TypeScript check and build**

  ```
  npm --prefix backend run check:types
  npm --prefix backend run build
  ```
  Expected: 0 errors, clean build.

- [ ] **Step 8: Run all prior tests to confirm no regression**

  ```
  npm --prefix backend run test:schema
  npm --prefix backend run test:adapter
  npm --prefix backend run test:services
  npm --prefix backend run test:auth-utils
  npm --prefix backend run test:auth-setup
  ```
  Expected: all PASS.

- [ ] **Step 9: Commit**

  ```
  git add backend/src/auth/setup.service.ts backend/src/scripts/setup-admin.ts backend/tests/auth-setup.test.ts backend/package.json
  git commit -m "feat(auth): implement CLI-based first-run admin setup — no HTTP endpoint"
  ```

---

## Task 3: Auth Service — Login and Logout

**Files:**
- Create: `backend/src/auth/auth.service.ts`
- Create: `backend/src/routes/auth.routes.ts`
- Modify: `backend/src/app.ts` — add `cookie-parser` and mount auth routes
- Create: `backend/tests/auth-service.test.ts`

**Interfaces:**
- Consumes:
  - `verifyPassword` from `../auth/password.js`
  - `generateSessionToken`, `hashToken`, `sessionExpiresAt` from `../auth/token.js`
  - `generateCsrfSecret` from `../auth/csrf.js`
  - `buildCookieOptions` from `../auth/cookie.js`
  - `userAccounts`, `userSessions` tables from `../db/schema.js`
  - `DatabaseExecutor` from `../db/client.js`
  - `ValidationError` from `../errors/app.errors.js`
  - `env.CLIENT_ORIGIN` and `env.NODE_ENV` from `../config/env.js`
- Produces:
  - `login(db: DatabaseExecutor, username: string, password: string, meta: { ip?: string; userAgent?: string }): Promise<{ rawToken: string; csrfSecret: string; expiresAt: Date; user: { id: string; username: string; role: string } }>`
  - `logout(db: DatabaseExecutor, tokenHash: string): Promise<void>` — sets `is_revoked = true`; no-ops if not found
  - `POST /api/v1/auth/login` → 200 `{ user, csrfToken }` + `token` cookie; or 401 (invalid credentials); or 403 (Origin mismatched or missing)
  - `POST /api/v1/auth/logout` → 204, clears `token` cookie
  - `AuthUser` type: `{ id: string; username: string; role: 'ADMIN' | 'HOD' | 'FACULTY'; faculty_id: string | null; is_active: boolean }`

**Login CSRF protection — Origin validation (implemented in route handler, not service):**

```typescript
const origin = req.headers['origin'];
if (!origin || origin !== env.CLIENT_ORIGIN) {
  return res.status(403).json({ error: 'Request origin not permitted' });
}
```

This validation occurs **before** credential parsing and verification.
- **Matching Origin (`origin === env.CLIENT_ORIGIN`):** Request proceeds to credential verification.
- **Mismatched Origin (`origin !== env.CLIENT_ORIGIN`):** Rejected with HTTP 403.
- **Missing Origin (`!origin`):** Rejected with HTTP 403. Browser clients executing POST requests send the `Origin` header.

**Server-to-server / non-browser authentication:**
The browser login route (`POST /api/v1/auth/login`) strictly rejects requests with a missing `Origin` header. Missing `Origin` is never silently permitted through this endpoint. If automated, headless, or server-to-server authentication is ever required in future phases, it must be introduced as an explicitly designed, sanctioned mechanism (e.g. dedicated API key or token exchange with separate authentication endpoints) following formal approval.

- [ ] **Step 1: Write the failing auth-service test**

  File: `backend/tests/auth-service.test.ts`

  ```typescript
  // Uses in-memory PGlite + migration + setupAdmin() to seed an admin.
  // Tests:
  // 1. login() with correct credentials returns { rawToken, csrfSecret, expiresAt, user }
  //    rawToken is 64 hex chars; csrfSecret is 64 hex chars
  // 2. A user_sessions row exists after login with token_hash = hashToken(rawToken)
  //    and is_revoked = false
  // 3. login() with wrong password throws ValidationError
  //    ("Invalid username or password" — same message, no enumeration)
  // 4. login() with unknown username throws ValidationError (same message)
  // 5. login() with an inactive user account throws ValidationError (same message)
  // 6. logout() with a valid tokenHash sets is_revoked = true in user_sessions
  // 7. logout() with an unknown tokenHash does not throw
  // 8. POST /api/v1/auth/login with correct credentials and matching Origin header returns 200
  //    response body has { user: { id, username, role }, csrfToken }
  //    response sets a Set-Cookie header containing 'token=' and 'HttpOnly'
  // 9. POST /api/v1/auth/login with wrong password and matching Origin returns 401
  // 10. POST /api/v1/auth/login with matching Origin header (env.CLIENT_ORIGIN) and valid credentials returns 200
  // 11. POST /api/v1/auth/login with mismatched Origin header ('https://evil.example.com')
  //     returns 403 regardless of credentials
  // 12. POST /api/v1/auth/login with missing Origin header
  //     returns 403 regardless of credentials
  // 13. POST /api/v1/auth/logout after login returns 204
  //     and the session row's is_revoked is true in the database
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```
  npm --prefix backend run test:auth-service
  ```
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/auth/auth.service.ts`**

  `login` logic:
  1. Query `userAccounts` where `sql\`LOWER(username) = LOWER(${username})\``. If not found or `is_active = false`, throw `ValidationError('Invalid username or password')`.
  2. `verifyPassword(password, row.password_hash)`. If false, throw same `ValidationError`.
  3. `const rawToken = generateSessionToken()`.
  4. `const tokenHash = hashToken(rawToken)`.
  5. `const csrfSecret = generateCsrfSecret()`.
  6. `const expiresAt = sessionExpiresAt()`.
  7. Insert into `userSessions`: `{ user_id, token_hash: tokenHash, csrf_secret: csrfSecret, ip_address: meta.ip ?? null, user_agent: meta.userAgent ?? null, expires_at: expiresAt, is_revoked: false }`.
  8. Return `{ rawToken, csrfSecret, expiresAt, user: { id, username, role } }`.

  `logout` logic:
  1. `db.update(userSessions).set({ is_revoked: true }).where(eq(userSessions.token_hash, tokenHash))`.
  2. No error if row not found (silent no-op).

- [ ] **Step 4: Implement `backend/src/routes/auth.routes.ts`**

  `POST /login`:
  1. Origin check:
     ```typescript
     const origin = req.headers['origin'];
     if (!origin || origin !== env.CLIENT_ORIGIN) {
       return res.status(403).json({ error: 'Request origin not permitted' });
     }
     ```
  2. Parse `{ username, password }` from `req.body`.
  3. Call `login(db, username, password, { ip: req.ip, userAgent: req.headers['user-agent'] })`.
  4. `res.cookie('token', rawToken, buildCookieOptions(env.NODE_ENV === 'production'))`.
  5. Return `200 { user, csrfToken: csrfSecret }`.
  6. Catch `ValidationError` → 401.

  `POST /logout`:
  1. Read `req.cookies?.token`. If absent, return 204 (idempotent).
  2. `const tokenHash = hashToken(req.cookies.token)`.
  3. Call `logout(db, tokenHash)`.
  4. `res.clearCookie('token', { path: '/' })`.
  5. Return 204.

- [ ] **Step 5: Add `test:auth-service` script to `backend/package.json`**

  ```json
  "test:auth-service": "tsx tests/auth-service.test.ts"
  ```

- [ ] **Step 6: Mount auth routes and add `cookie-parser` in `backend/src/app.ts`**

  ```typescript
  import cookieParser from 'cookie-parser';
  import { authRouter } from './routes/auth.routes.js';

  // After express.json():
  app.use(cookieParser());

  // After health router:
  app.use('/api/v1/auth', authRouter);
  ```

- [ ] **Step 7: Run test to verify it passes**

  ```
  npm --prefix backend run test:auth-service
  ```
  Expected: all 13 assertions PASS.

- [ ] **Step 8: Run TypeScript check**

  ```
  npm --prefix backend run check:types
  ```
  Expected: 0 errors.

- [ ] **Step 9: Run all prior tests**

  ```
  npm --prefix backend run test:schema
  npm --prefix backend run test:adapter
  npm --prefix backend run test:services
  npm --prefix backend run test:auth-utils
  npm --prefix backend run test:auth-setup
  npm --prefix backend run test:auth-service
  ```
  Expected: all PASS.

- [ ] **Step 10: Commit**

  ```
  git add backend/src/auth/auth.service.ts backend/src/routes/auth.routes.ts backend/src/app.ts backend/tests/auth-service.test.ts backend/package.json
  git commit -m "feat(auth): implement login and logout with Origin validation and session tokens"
  ```

---

## Task 4: Session Authentication Middleware and /me Route

**Files:**
- Create: `backend/src/middleware/authenticate.ts`
- Create: `backend/src/middleware/requireRole.ts`
- Modify: `backend/src/routes/auth.routes.ts` — add `GET /me`
- Create: `backend/tests/auth-middleware.test.ts`

**Interfaces:**
- Consumes:
  - `hashToken` from `../auth/token.js`
  - `userAccounts`, `userSessions` from `../db/schema.js`
  - `DatabaseExecutor`, `dbAdapter` from `../db/client.js`
- Produces:
  - `authenticate`: `express.RequestHandler` — reads `req.cookies.token`, hashes it, queries `user_sessions` WHERE `token_hash = hash AND is_revoked = false AND expires_at > NOW()`, loads `user_accounts` row, sets `res.locals.user: AuthUser`; responds 401 if any check fails
  - `requireRole(...roles: Array<'ADMIN' | 'HOD' | 'FACULTY'>)`: returns `express.RequestHandler` — checks `res.locals.user.role`; responds 403 if not in list
  - `csrfGuard`: `express.RequestHandler` — Synchronizer Token Pattern middleware; checks `req.headers['x-csrf-token'] === res.locals.user.csrf_secret`; responds 403 if mismatch or missing; safe requests (GET, HEAD, OPTIONS) are exempt
  - `AuthUser` type (exported): `{ id: string; username: string; role: 'ADMIN' | 'HOD' | 'FACULTY'; faculty_id: string | null; is_active: boolean; csrf_secret: string }`
  - `GET /api/v1/auth/me` → 200 `{ user: { id, username, role, faculty_id } }` (behind `authenticate`)

> **Note on `csrfGuard` (Synchronizer Token Pattern):**
> Smart Campus implements the server-backed **Synchronizer Token Pattern** for authenticated requests.
> - **Generation & Storage:** A cryptographically strong `csrf_secret` (32 random bytes hex-encoded, 64 hex chars) is generated at session creation and stored server-side in the `user_sessions.csrf_secret` column.
> - **Delivery & Confidentiality:** The secret is transmitted only to the authenticated client in the initial login JSON response body (`{ user, csrfToken: csrfSecret }`). It is never included in URLs, never stored in a separate cookie, and never logged in access logs or application error logs.
> - **Verification:** For all authenticated state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`), `csrfGuard` verifies that `req.headers['x-csrf-token']` equals `res.locals.user.csrf_secret` (populated by `authenticate`).
> - **Safe Methods Exempt:** Safe idempotent HTTP methods (`GET`, `HEAD`, `OPTIONS`) are exempt from token verification.
> - **Placement:** Because token verification depends on the authenticated session's secret in `res.locals.user`, `csrfGuard` must always be placed downstream of `authenticate`. No additional CSRF cookies or external packages are introduced.

- [ ] **Step 1: Write the failing middleware test**

  File: `backend/tests/auth-middleware.test.ts`

  ```typescript
  // Uses in-memory PGlite + migration + setupAdmin() + login() to get a valid rawToken and csrfSecret.
  // Tests:
  // 1. Request with valid unexpired cookie → authenticate populates res.locals.user and calls next()
  // 2. Request with no cookie → authenticate responds 401
  // 3. Request with a token that hashes to a non-existent session → authenticate responds 401
  // 4. Request with a revoked session token → authenticate responds 401
  //    (is_revoked = true set directly in DB before the request)
  // 5. Request with an expired session (expires_at set to 1ms in the past) → authenticate responds 401
  // 6. GET /api/v1/auth/me with valid cookie → 200 { user: { id, username, role, faculty_id } }
  // 7. GET /api/v1/auth/me with no cookie → 401
  // 8. requireRole('ADMIN') with an ADMIN user → calls next()
  // 9. requireRole('HOD') with an ADMIN user → responds 403
  // 10. POST with valid cookie but missing X-CSRF-Token → csrfGuard responds 403
  // 11. POST with valid cookie and correct X-CSRF-Token → csrfGuard calls next()
  // 12. POST with valid cookie and wrong X-CSRF-Token value → csrfGuard responds 403
  // 13. GET with valid cookie but no X-CSRF-Token → csrfGuard calls next() (GET is exempt)
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```
  npm --prefix backend run test:auth-middleware
  ```
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement `backend/src/middleware/authenticate.ts`**

  Logic:
  1. Read `req.cookies?.token`. If absent, respond `401 { error: 'Authentication required' }`.
  2. `const tokenHash = hashToken(req.cookies.token)`.
  3. Query `userSessions` WHERE `token_hash = tokenHash AND is_revoked = false AND expires_at > NOW()`. If no row, respond 401.
  4. Query `userAccounts` by `session.user_id`. If not found or `is_active = false`, respond 401.
  5. Set `res.locals.user = { id, username, role, faculty_id, is_active, csrf_secret: session.csrf_secret }`.
  6. Call `next()`.

  > Accept an optional `db: DatabaseExecutor` parameter for testability. Default to `dbAdapter.db`.

  Also export `csrfGuard` from the same file (implementing the Synchronizer Token Pattern):
  - Skip verification for safe idempotent methods: `GET`, `HEAD`, `OPTIONS`.
  - For state-mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`):
    - Read `req.headers['x-csrf-token']`.
    - Compare securely against `res.locals.user?.csrf_secret`.
    - If header is missing, not a string, or does not match `res.locals.user.csrf_secret`, respond `403 { error: 'Invalid CSRF token' }`. Do not log secret values.
    - If matching, call `next()`.

- [ ] **Step 4: Implement `backend/src/middleware/requireRole.ts`**

  ```typescript
  export function requireRole(...roles: Array<'ADMIN' | 'HOD' | 'FACULTY'>): express.RequestHandler
  ```
  If `res.locals.user.role` not in `roles`, respond `403 { error: 'Forbidden' }`.

- [ ] **Step 5: Add `GET /me` to `backend/src/routes/auth.routes.ts`**

  ```typescript
  import { authenticate } from '../middleware/authenticate.js';
  router.get('/me', authenticate, (_req, res) => {
    const { id, username, role, faculty_id } = res.locals.user;
    res.json({ user: { id, username, role, faculty_id } });
  });
  ```

- [ ] **Step 6: Add `test:auth-middleware` script to `backend/package.json`**

  ```json
  "test:auth-middleware": "tsx tests/auth-middleware.test.ts"
  ```

- [ ] **Step 7: Run test to verify it passes**

  ```
  npm --prefix backend run test:auth-middleware
  ```
  Expected: all 13 assertions PASS.

- [ ] **Step 8: Run TypeScript check**

  ```
  npm --prefix backend run check:types
  ```
  Expected: 0 errors.

- [ ] **Step 9: Run all tests**

  ```
  npm --prefix backend run test:schema
  npm --prefix backend run test:adapter
  npm --prefix backend run test:services
  npm --prefix backend run test:auth-utils
  npm --prefix backend run test:auth-setup
  npm --prefix backend run test:auth-service
  npm --prefix backend run test:auth-middleware
  ```
  Expected: all PASS.

- [ ] **Step 10: Commit**

  ```
  git add backend/src/middleware/authenticate.ts backend/src/middleware/requireRole.ts backend/src/routes/auth.routes.ts backend/tests/auth-middleware.test.ts backend/package.json
  git commit -m "feat(auth): add session authentication middleware, requireRole guard and /me route"
  ```

---

## Task 5: Final Verification and Push

**Files:** No new files. Verification only.

- [ ] **Step 1: Run TypeScript check**

  ```
  npm --prefix backend run check:types
  ```
  Expected: 0 errors.

- [ ] **Step 2: Run build**

  ```
  npm --prefix backend run build
  ```
  Expected: clean build, no errors.

- [ ] **Step 3: Run all tests**

  ```
  npm --prefix backend run test:schema
  npm --prefix backend run test:adapter
  npm --prefix backend run test:services
  npm --prefix backend run test:auth-utils
  npm --prefix backend run test:auth-setup
  npm --prefix backend run test:auth-service
  npm --prefix backend run test:auth-middleware
  ```
  Expected: all PASS.

- [ ] **Step 4: Run health test** *(requires BypassSandbox: true)*

  ```
  npm --prefix backend test
  ```
  Expected: health PASS.

- [ ] **Step 5: Review git diff before push**

  ```
  git status
  git diff --stat origin/main
  ```
  Confirm: no `.env` files, no `node_modules`, no `dist/`, no secrets, no `AGENTS.md`, no `GEMINI.md` staged.

- [ ] **Step 6: Push to origin/main**

  ```
  git push origin main
  ```
  Expected: clean push, no conflicts.

- [ ] **Step 7: Report PASS**

  Report: commit hash, all test results, and the list of files pushed. Wait for user approval before starting Step 4.

---

## File Summary

| File | Action |
|------|--------|
| `backend/src/auth/token.ts` | Create |
| `backend/src/auth/password.ts` | Create |
| `backend/src/auth/csrf.ts` | Create |
| `backend/src/auth/cookie.ts` | Create |
| `backend/src/auth/setup.service.ts` | Create |
| `backend/src/auth/auth.service.ts` | Create |
| `backend/src/scripts/setup-admin.ts` | Create — CLI script, no HTTP exposure |
| `backend/src/routes/auth.routes.ts` | Create |
| `backend/src/middleware/authenticate.ts` | Create |
| `backend/src/middleware/requireRole.ts` | Create |
| `backend/src/app.ts` | Modify — add cookie-parser, mount auth routes |
| `backend/package.json` | Modify — add cookie-parser, test scripts, setup:admin script |
| `backend/package-lock.json` | Modify — dependency lock |
| `backend/tests/auth-utils.test.ts` | Create |
| `backend/tests/auth-setup.test.ts` | Create |
| `backend/tests/auth-service.test.ts` | Create |
| `backend/tests/auth-middleware.test.ts` | Create |

**Removed from previous plan:**
| File | Reason |
|------|--------|
| `backend/src/routes/setup.routes.ts` | Replaced by CLI script — no HTTP setup endpoint |

## Operator Setup Instructions (to be run on the server host)

```bash
# First-run Admin account creation — run once on the host, never exposed via HTTP
npm --prefix backend run setup:admin
# Interactive prompts: username, password (echoed off)
# Exits 0 on success, 1 on ConflictError or ValidationError
```
