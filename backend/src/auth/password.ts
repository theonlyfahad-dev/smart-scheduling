import bcrypt from 'bcryptjs';

export const BCRYPT_SALT_ROUNDS = 12;

/**
 * Hashes a plaintext password using bcryptjs with work factor 12.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash.
 * Returns true if valid, false otherwise.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
