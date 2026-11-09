import assert from 'node:assert';
import {
  generateSessionToken,
  hashToken,
  sessionExpiresAt,
  SESSION_LIFETIME_SECONDS,
} from '../src/auth/token.js';
import {
  BCRYPT_SALT_ROUNDS,
  hashPassword,
  verifyPassword,
} from '../src/auth/password.js';
import { generateCsrfSecret } from '../src/auth/csrf.js';
import { buildCookieOptions } from '../src/auth/cookie.js';

async function runAuthUtilsTestSuite(): Promise<void> {
  console.log('[Auth Utils Test Suite] Running assertions...');

  // 1. generateSessionToken() returns a string of exactly 64 hex chars
  const token1 = generateSessionToken();
  assert.strictEqual(typeof token1, 'string', 'Token must be a string');
  assert.strictEqual(token1.length, 64, 'Token must be 64 characters long');
  assert.match(token1, /^[0-9a-f]{64}$/, 'Token must be lowercase hex');
  console.log('✓ 1. generateSessionToken() returns 64 lowercase hex characters');

  // 2. Two calls to generateSessionToken() return different values
  const token2 = generateSessionToken();
  assert.notStrictEqual(token1, token2, 'Two generated tokens must be different');
  console.log('✓ 2. Two calls to generateSessionToken() return distinct tokens');

  // 3. hashToken(raw) returns a 64-char lowercase hex string
  const hash1 = hashToken(token1);
  assert.strictEqual(typeof hash1, 'string', 'Hash must be a string');
  assert.strictEqual(hash1.length, 64, 'Hash must be 64 characters long');
  assert.match(hash1, /^[0-9a-f]{64}$/, 'Hash must be lowercase hex');
  console.log('✓ 3. hashToken() returns 64 lowercase hex characters (SHA-256)');

  // 4. hashToken(raw) is deterministic: same input → same output
  const hash1Repeat = hashToken(token1);
  assert.strictEqual(hash1, hash1Repeat, 'hashToken must be deterministic');
  console.log('✓ 4. hashToken() is deterministic');

  // 5. hashPassword() returns a string starting with "$2b$12$"
  assert.strictEqual(BCRYPT_SALT_ROUNDS, 12, 'BCRYPT_SALT_ROUNDS constant must be 12');
  const plainPassword = 'CorrectHorseBatteryStaple123!';
  const hashedPassword = await hashPassword(plainPassword);
  assert.strictEqual(typeof hashedPassword, 'string', 'Hashed password must be a string');
  assert.ok(
    hashedPassword.startsWith('$2b$12$') || hashedPassword.startsWith('$2a$12$'),
    `Hash must begin with bcrypt work factor 12 prefix, got: ${hashedPassword.slice(0, 7)}`
  );
  console.log('✓ 5. hashPassword() uses bcryptjs with work factor 12');

  // 6. verifyPassword(plain, hash) resolves true for matching pair
  const isMatch = await verifyPassword(plainPassword, hashedPassword);
  assert.strictEqual(isMatch, true, 'verifyPassword must resolve true for correct password');
  console.log('✓ 6. verifyPassword() returns true for matching password');

  // 7. verifyPassword(plain, hash) resolves false for wrong plain
  const isWrong = await verifyPassword('IncorrectPassword123!', hashedPassword);
  assert.strictEqual(isWrong, false, 'verifyPassword must resolve false for wrong password');
  console.log('✓ 7. verifyPassword() returns false for mismatched password');

  // 8. generateCsrfSecret() returns exactly 64 hex chars
  const csrf1 = generateCsrfSecret();
  assert.strictEqual(typeof csrf1, 'string', 'CSRF secret must be a string');
  assert.strictEqual(csrf1.length, 64, 'CSRF secret must be 64 characters long');
  assert.match(csrf1, /^[0-9a-f]{64}$/, 'CSRF secret must be lowercase hex');
  console.log('✓ 8. generateCsrfSecret() returns 64 lowercase hex characters');

  // 9. Two calls to generateCsrfSecret() return different values
  const csrf2 = generateCsrfSecret();
  assert.notStrictEqual(csrf1, csrf2, 'Two generated CSRF secrets must be distinct');
  console.log('✓ 9. Two calls to generateCsrfSecret() return distinct values');

  // 10. buildCookieOptions(true).secure === true
  const prodCookie = buildCookieOptions(true);
  assert.strictEqual(prodCookie.secure, true, 'Cookie secure must be true in production');
  console.log('✓ 10. buildCookieOptions(true).secure is true');

  // 11. buildCookieOptions(false).secure === false
  const devCookie = buildCookieOptions(false);
  assert.strictEqual(devCookie.secure, false, 'Cookie secure must be false in non-production');
  console.log('✓ 11. buildCookieOptions(false).secure is false');

  // 12. buildCookieOptions(true).httpOnly === true
  assert.strictEqual(prodCookie.httpOnly, true, 'Cookie httpOnly must be true');
  console.log('✓ 12. buildCookieOptions().httpOnly is true');

  // 13. buildCookieOptions(true).sameSite === 'strict'
  assert.strictEqual(prodCookie.sameSite, 'strict', 'Cookie sameSite must be strict');
  console.log('✓ 13. buildCookieOptions().sameSite is strict');

  // 14. buildCookieOptions(true).maxAge === SESSION_LIFETIME_SECONDS * 1000
  assert.strictEqual(
    prodCookie.maxAge,
    SESSION_LIFETIME_SECONDS * 1000,
    `Cookie maxAge must equal ${SESSION_LIFETIME_SECONDS * 1000} ms`
  );
  assert.strictEqual(prodCookie.path, '/', 'Cookie path must be /');
  console.log('✓ 14. buildCookieOptions() sets maxAge to 86,400,000 ms (24h) and path to /');

  // 15. sessionExpiresAt() returns a Date ~24h in the future (within 5s tolerance)
  const now = Date.now();
  const expiresAt = sessionExpiresAt();
  assert.ok(expiresAt instanceof Date, 'sessionExpiresAt must return a Date instance');
  const diffMs = expiresAt.getTime() - now;
  const expectedMs = SESSION_LIFETIME_SECONDS * 1000;
  assert.ok(
    Math.abs(diffMs - expectedMs) < 5000,
    `Expected expiry to be ~24h from now, got diff ${diffMs} ms`
  );
  console.log('✓ 15. sessionExpiresAt() returns a Date exactly 24h into the future');

  console.log('\n[Auth Utils Test Suite] All 15 assertions passed successfully.');
}

runAuthUtilsTestSuite().catch((err) => {
  console.error('[Auth Utils Test Suite] FAILED:', err);
  process.exit(1);
});
