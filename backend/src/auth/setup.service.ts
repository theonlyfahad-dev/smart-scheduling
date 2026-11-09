import { eq, sql } from 'drizzle-orm';
import { userAccounts } from '../db/schema.js';
import type { DatabaseExecutor } from '../db/client.js';
import { ValidationError, ConflictError } from '../errors/app.errors.js';
import { hashPassword } from './password.js';

export interface AdminUserPayload {
  id: string;
  username: string;
  role: string;
}

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,50}$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Validates and atomically creates the initial system Administrator account.
 * Uses a transaction-scoped PostgreSQL advisory lock (`pg_advisory_xact_lock`)
 * to serialize concurrent creation attempts at the database level.
 *
 * @param db Database instance or transaction executor
 * @param username Administrator username (3-50 alphanumeric + underscore)
 * @param password Administrator password (minimum 8 characters)
 * @returns The created admin user payload { id, username, role }
 * @throws ValidationError If username or password do not satisfy constraints
 * @throws ConflictError If an Administrator account already exists
 */
export async function setupAdmin(
  db: DatabaseExecutor,
  username: string,
  password: string
): Promise<AdminUserPayload> {
  // Input validation (pre-database check)
  if (!username || typeof username !== 'string' || !USERNAME_REGEX.test(username)) {
    throw new ValidationError(
      'Username must be between 3 and 50 characters and contain only alphanumeric characters and underscores.'
    );
  }

  if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters in length.`
    );
  }

  // Atomically check and create Admin inside a transaction with an advisory lock
  return db.transaction(async (tx: DatabaseExecutor) => {
    // 1. Acquire transaction-level advisory lock
    // Serializes concurrent setup attempts across transactions in PostgreSQL and PGlite
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('smart_campus_admin_setup_lock'))`);

    // 2. Count existing accounts with role = 'ADMIN'
    const [result] = await tx
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(userAccounts)
      .where(eq(userAccounts.role, 'ADMIN'));

    if (result && result.count > 0) {
      throw new ConflictError('Admin account already exists.');
    }

    // 3. Hash password using bcryptjs (work factor 12)
    const passwordHash = await hashPassword(password);

    // 4. Insert the new Admin record
    const [created] = await tx
      .insert(userAccounts)
      .values({
        username,
        password_hash: passwordHash,
        role: 'ADMIN',
        faculty_id: null,
        is_active: true,
      })
      .returning({
        id: userAccounts.id,
        username: userAccounts.username,
        role: userAccounts.role,
      });

    return created;
  });
}
