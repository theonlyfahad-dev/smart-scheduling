import { eq, sql } from 'drizzle-orm';
import { userAccounts, userSessions } from '../db/schema.js';
import type { DatabaseExecutor } from '../db/client.js';
import { ValidationError } from '../errors/app.errors.js';
import { verifyPassword } from './password.js';
import { generateSessionToken, hashToken, sessionExpiresAt } from './token.js';
import { generateCsrfSecret } from './csrf.js';

export interface LoginMetadata {
  ip?: string;
  userAgent?: string;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: string;
  faculty_id: string | null;
}

export interface LoginResult {
  rawToken: string;
  csrfSecret: string;
  expiresAt: Date;
  user: AuthenticatedUser;
}

const GENERIC_AUTH_ERROR = 'Invalid username or password';

/**
 * Authenticates a user with username and password, and establishes a new session.
 * - Performs case-insensitive username lookup (LOWER(username))
 * - Verifies password using bcryptjs (work factor 12)
 * - Rejects inactive accounts with the same generic error
 * - Generates cryptographically secure opaque token; stores only its SHA-256 hash in DB
 * - Generates cryptographically secure Synchronizer CSRF secret
 *
 * @param db Database executor
 * @param username Plaintext username
 * @param password Plaintext password
 * @param meta Optional IP and User-Agent metadata
 * @returns LoginResult with raw token for cookie, CSRF secret for body, and user info
 * @throws ValidationError with generic message if credentials fail or account is inactive
 */
export async function login(
  db: DatabaseExecutor,
  username: string,
  password: string,
  meta?: LoginMetadata
): Promise<LoginResult> {
  if (
    !username ||
    typeof username !== 'string' ||
    !password ||
    typeof password !== 'string'
  ) {
    throw new ValidationError(GENERIC_AUTH_ERROR);
  }

  // Case-insensitive lookup using LOWER(username)
  const [user] = await db
    .select()
    .from(userAccounts)
    .where(sql`LOWER(${userAccounts.username}) = LOWER(${username.trim()})`);

  // Generic rejection if user does not exist or is inactive
  if (!user || !user.is_active) {
    throw new ValidationError(GENERIC_AUTH_ERROR);
  }

  // Password verification
  const isMatch = await verifyPassword(password, user.password_hash);
  if (!isMatch) {
    throw new ValidationError(GENERIC_AUTH_ERROR);
  }

  // Session token generation
  const rawToken = generateSessionToken();
  const tokenHash = hashToken(rawToken);
  const csrfSecret = generateCsrfSecret();
  const expiresAt = sessionExpiresAt();

  // Persist session record (only SHA-256 token hash is stored, never raw token)
  await db.insert(userSessions).values({
    user_id: user.id,
    token_hash: tokenHash,
    csrf_secret: csrfSecret,
    ip_address: meta?.ip ?? null,
    user_agent: meta?.userAgent ?? null,
    expires_at: expiresAt,
    is_revoked: false,
  });

  return {
    rawToken,
    csrfSecret,
    expiresAt,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      faculty_id: user.faculty_id,
    },
  };
}

/**
 * Revokes an existing session by setting is_revoked = true.
 * - Hashes the raw session token before looking up in user_sessions
 * - Idempotent: non-existent or already revoked sessions do not cause errors
 *
 * @param db Database executor
 * @param rawToken Raw session token from the cookie
 */
export async function logout(db: DatabaseExecutor, rawToken: string): Promise<void> {
  if (!rawToken || typeof rawToken !== 'string') {
    return;
  }

  const tokenHash = hashToken(rawToken);

  await db
    .update(userSessions)
    .set({ is_revoked: true })
    .where(eq(userSessions.token_hash, tokenHash));
}
