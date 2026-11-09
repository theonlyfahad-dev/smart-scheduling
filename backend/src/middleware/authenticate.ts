import { Request, Response, NextFunction } from 'express';
import { eq, sql, and } from 'drizzle-orm';
import { userAccounts, userSessions } from '../db/schema.js';
import { dbAdapter, type DatabaseExecutor } from '../db/client.js';
import { hashToken } from '../auth/token.js';
import { SESSION_COOKIE_NAME } from '../auth/cookie.js';

export interface AuthenticatedLocalsUser {
  id: string;
  username: string;
  role: 'ADMIN' | 'HOD' | 'FACULTY';
  faculty_id: string | null;
  is_active: boolean;
  csrf_secret: string;
  session_id: string;
}

/**
 * Creates the session authentication middleware.
 * - Reads raw token from the HttpOnly session cookie
 * - Hashes token with SHA-256 before looking up in user_sessions
 * - Rejects missing, invalid, expired (expires_at <= NOW()), or revoked sessions with HTTP 401
 * - Verifies user exists and is active (is_active === true)
 * - Populates res.locals.user with safe authenticated user and session context
 * - Never exposes raw session tokens or password hashes
 *
 * @param customDb Optional database executor for isolated testing
 */
export function createAuthenticateMiddleware(customDb?: DatabaseExecutor) {
  const getDb = () => customDb ?? dbAdapter.db;

  return async function authenticate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];

    if (!rawToken || typeof rawToken !== 'string') {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const tokenHash = hashToken(rawToken);

    try {
      const db = getDb();

      // Query active, unexpired, unrevoked session
      const [session] = await db
        .select()
        .from(userSessions)
        .where(
          and(
            eq(userSessions.token_hash, tokenHash),
            eq(userSessions.is_revoked, false),
            sql`${userSessions.expires_at} > NOW()`
          )
        );

      if (!session) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Query linked user account
      const [user] = await db
        .select()
        .from(userAccounts)
        .where(eq(userAccounts.id, session.user_id));

      if (!user || !user.is_active) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Populate safe context in res.locals
      if (!res.locals) {
        res.locals = {};
      }
      res.locals.user = {
        id: user.id,
        username: user.username,
        role: user.role as 'ADMIN' | 'HOD' | 'FACULTY',
        faculty_id: user.faculty_id,
        is_active: user.is_active,
        csrf_secret: session.csrf_secret,
        session_id: session.id,
      };

      next();
    } catch (err: unknown) {
      console.error('[Authenticate Middleware Error]:', err);
      res.status(401).json({ error: 'Authentication required' });
    }
  };
}

export const authenticate = createAuthenticateMiddleware();
export { csrfGuard } from './csrfGuard.js';
