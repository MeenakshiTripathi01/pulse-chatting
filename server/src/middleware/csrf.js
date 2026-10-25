import { randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { CSRF_COOKIE, setCsrfCookie } from '../utils/cookies.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const TOKEN_PATTERN = /^[a-f\d]{64}$/;

/**
 * GET /api/auth/csrf
 *
 * Returns a CSRF token in the JSON body and stores the same value in an HttpOnly cookie.
 * The browser app keeps the token in memory and echoes it in the X-CSRF-Token header.
 * A malicious site can make the browser *send* our cookies, but CORS stops it from *reading*
 * this response, so it can never know the token to put in the header.
 */
export function issueCsrfToken(req, res) {
  const existing = req.cookies?.[CSRF_COOKIE];
  // Reuse a valid existing token so multiple open tabs keep working.
  const token = TOKEN_PATTERN.test(existing ?? '') ? existing : randomBytes(32).toString('hex');

  setCsrfCookie(res, token);
  res.set('Cache-Control', 'no-store');
  res.json({ csrfToken: token });
}

/** Rejects state-changing requests whose header token does not match the cookie token. */
export function requireCsrfToken(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get('x-csrf-token');

  if (!cookieToken || !headerToken || !tokensMatch(cookieToken, headerToken)) {
    throw AppError.forbidden(
      'Your security token is missing or expired. Please refresh and try again.',
      'CSRF_INVALID',
    );
  }
  next();
}

function tokensMatch(a, b) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}
