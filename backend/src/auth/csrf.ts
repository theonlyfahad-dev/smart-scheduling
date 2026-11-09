import crypto from 'node:crypto';

/**
 * Generates a cryptographically secure CSRF secret for the Synchronizer Token Pattern.
 * 32 random bytes encoded as a 64-character lowercase hex string.
 * Stored in user_sessions.csrf_secret and delivered to the client upon login.
 */
export function generateCsrfSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}
