import { Router, Request, Response } from 'express';
import { env } from '../config/env.js';
import { dbAdapter } from '../db/client.js';
import { login, logout } from './auth.service.js';
import { buildCookieOptions, SESSION_COOKIE_NAME } from './cookie.js';
import { ValidationError } from '../errors/app.errors.js';
import { authenticate, createAuthenticateMiddleware } from '../middleware/authenticate.js';
import { csrfGuard } from '../middleware/csrfGuard.js';

/**
 * Safely compares the request Origin header against the configured allowed origin.
 * Normalizes both URLs using the URL API (host, scheme, port) and strictly compares origins.
 * Does NOT use substring matching.
 * Returns false if origin is missing, malformed, or mismatched.
 */
export function isOriginAllowed(originHeader: string | undefined, configuredOrigin: string): boolean {
  if (!originHeader || typeof originHeader !== 'string') {
    return false;
  }

  try {
    const requestOrigin = new URL(originHeader).origin;
    const allowedOrigin = new URL(configuredOrigin).origin;
    return requestOrigin === allowedOrigin;
  } catch {
    return false;
  }
}

export function createAuthRouter(customDb?: any): Router {
  const router = Router();
  const getDb = () => customDb ?? dbAdapter.db;
  const authMiddleware = customDb ? createAuthenticateMiddleware(customDb) : authenticate;

  /**
   * POST /login
   * 1. Strict Origin validation (rejects missing or mismatched Origin with HTTP 403).
   * 2. Validates request body fields (rejects missing fields with HTTP 400).
   * 3. Authenticates credentials and creates session (rejects invalid with HTTP 401).
   * 4. Sets session token strictly in HttpOnly, SameSite=Strict cookie.
   * 5. Returns user info and Synchronizer CSRF token in JSON body.
   */
  router.post('/login', async (req: Request, res: Response) => {
    // 1. Strict Origin validation before any credential verification
    const origin = req.headers['origin'];
    if (!isOriginAllowed(origin, env.CLIENT_ORIGIN)) {
      return res.status(403).json({ error: 'Request origin not permitted' });
    }

    // 2. Body input validation
    const { username, password } = req.body ?? {};
    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // 3. Authentication
    try {
      const db = getDb();
      const meta = {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      };

      const result = await login(db, username, password, meta);

      // 4. Set HttpOnly session cookie
      res.cookie(
        SESSION_COOKIE_NAME,
        result.rawToken,
        buildCookieOptions(env.NODE_ENV === 'production')
      );

      // 5. Response payload (raw token is never exposed in JSON body)
      return res.status(200).json({
        message: 'Login successful',
        user: result.user,
        csrfToken: result.csrfSecret,
      });
    } catch (err: unknown) {
      if (err instanceof ValidationError) {
        return res.status(401).json({ error: err.message });
      }

      console.error('[Auth Route Error] Unexpected login failure:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /logout
   * Protected with authenticate and csrfGuard.
   * 1. Verifies authenticated session cookie.
   * 2. Verifies Synchronizer CSRF token header.
   * 3. Revokes session record in database (idempotent).
   * 4. Clears the session cookie.
   * 5. Returns success response.
   */
  router.post('/logout', authMiddleware, csrfGuard, async (req: Request, res: Response) => {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];

    if (rawToken && typeof rawToken === 'string') {
      try {
        const db = getDb();
        await logout(db, rawToken);
      } catch (err: unknown) {
        console.error('[Auth Route Error] Unexpected logout failure:', err);
      }
    }

    // Clear session cookie with identical path and security flags
    res.clearCookie(SESSION_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: env.NODE_ENV === 'production',
    });

    return res.status(200).json({ message: 'Logout successful' });
  });

  /**
   * GET /me
   * Protected with authenticate.
   * Returns authenticated user profile context.
   */
  router.get('/me', authMiddleware, (_req: Request, res: Response) => {
    const user = res.locals.user;

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    return res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        faculty_id: user.faculty_id,
      },
      csrfToken: user.csrf_secret,
    });
  });

  return router;
}

export const authRouter = createAuthRouter();
