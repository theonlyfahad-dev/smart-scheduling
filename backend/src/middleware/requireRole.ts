import { Request, Response, NextFunction } from 'express';

export type UserRole = 'ADMIN' | 'HOD' | 'FACULTY';

/**
 * Role-based access control middleware factory.
 * Enforces explicit role matching against the authenticated user context in res.locals.user.
 * - Rejects unauthenticated or missing context with HTTP 403 Forbidden
 * - Rejects unauthorized roles with HTTP 403 Forbidden
 * - Default-deny for HOD and FACULTY unless explicitly permitted
 * - No implicit permissions inferred from class codes or external tokens
 *
 * @param allowedRoles Allowed roles for the target route
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return function roleGuard(_req: Request, res: Response, next: NextFunction): void {
    const user = res.locals.user;

    if (!user || !user.role || !allowedRoles.includes(user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    next();
  };
}
