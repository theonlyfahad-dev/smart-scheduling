import crypto from 'node:crypto';

export const SESSION_LIFETIME_SECONDS = 86400; // 24 hours

/**
 * Generates a cryptographically secure opaque session token.
 * 32 random bytes encoded as a 64-character lowercase hex string.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Computes the deterministic SHA-256 hash of a raw session token.
 * Only this hash is stored in the user_sessions table.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Returns the expiration Date for a newly created session (24 hours from now).
 */
export function sessionExpiresAt(): Date {
  return new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000);
}
