import type { CookieOptions } from 'express';
import { SESSION_LIFETIME_SECONDS } from './token.js';

export const SESSION_COOKIE_NAME = 'token';

/**
 * Builds the standard security options for the session cookie.
 * - HttpOnly: true (prevents client-side script access)
 * - SameSite: 'strict' (prevents cross-site cookie transmission)
 * - Secure: true in production (HTTPS only)
 * - Path: '/' (available across entire API)
 * - MaxAge: 86,400,000 ms (24 hours, aligned with SESSION_LIFETIME_SECONDS)
 */
export function buildCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction,
    path: '/',
    maxAge: SESSION_LIFETIME_SECONDS * 1000,
  };
}
