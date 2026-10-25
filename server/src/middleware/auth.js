import { getSessionFromToken } from '../services/authService.js';
import { AppError } from '../utils/AppError.js';
import { AUTH_COOKIE, clearAuthCookie } from '../utils/cookies.js';

/**
 * Allows the request through only with a valid session cookie. Sets `req.user` to the
 * authenticated user loaded from the database; the rest of the app trusts only this value,
 * never a user id sent by the client.
 */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) throw AppError.unauthorized('Please log in to continue', 'UNAUTHENTICATED');

  const session = await getSessionFromToken(token);
  if (!session) {
    clearAuthCookie(res);
    throw AppError.unauthorized(
      'Your session has expired. Please log in again.',
      'SESSION_EXPIRED',
    );
  }

  req.user = session.user;
  next();
}
