import { config } from '../config/env.js';

export const AUTH_COOKIE = 'chat_token';
export const CSRF_COOKIE = 'chat_csrf';

function baseCookieOptions() {
  return {
    httpOnly: true, // not readable from JavaScript, so XSS cannot steal it
    secure: config.isProduction, // only sent over HTTPS in production
    sameSite: config.cookieSameSite,
    path: '/',
  };
}

export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, {
    ...baseCookieOptions(),
    maxAge: config.jwtExpiresInSeconds * 1000,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, baseCookieOptions());
}

export function setCsrfCookie(res, token) {
  res.cookie(CSRF_COOKIE, token, {
    ...baseCookieOptions(),
    maxAge: config.jwtExpiresInSeconds * 1000,
  });
}
