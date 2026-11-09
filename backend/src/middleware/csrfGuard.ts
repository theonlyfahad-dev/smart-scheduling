import { Request, Response, NextFunction } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Synchronizer Token Pattern CSRF guard middleware.
 * Verifies that the X-CSRF-Token request header matches the authenticated session's stored CSRF secret.
 * - Exempts safe methods (GET, HEAD, OPTIONS).
 * - Enforces verification on state-changing methods (POST, PUT, PATCH, DELETE).
 * - Rejects missing, malformed, or mismatched tokens with HTTP 403.
 * - Must be placed downstream of authenticate middleware.
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction): void {
  // Safe HTTP methods are exempt from CSRF token verification
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const user = res.locals.user;
  if (!user || !user.csrf_secret) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  const tokenHeader = req.headers['x-csrf-token'];

  if (!tokenHeader || typeof tokenHeader !== 'string' || tokenHeader !== user.csrf_secret) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next();
}
