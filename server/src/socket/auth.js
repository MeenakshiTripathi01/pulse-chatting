import { parse as parseCookies } from 'cookie';
import { getSessionFromToken } from '../services/authService.js';
import { AUTH_COOKIE } from '../utils/cookies.js';
import { toPublicUser } from '../utils/serializers.js';

function authError(code, message) {
  const error = new Error(message);
  error.data = { code }; // delivered to the client's "connect_error" handler
  return error;
}

/**
 * Socket.IO middleware that runs once per connection, before "connection" fires.
 * The browser sends the same HttpOnly cookie it uses for REST, so both share one
 * authentication path (getSessionFromToken).
 */
export async function authenticateSocket(socket, next) {
  try {
    const cookies = parseCookies(socket.handshake.headers.cookie ?? '');
    const session = await getSessionFromToken(cookies[AUTH_COOKIE]);

    if (!session) {
      return next(authError('UNAUTHENTICATED', 'Please log in to connect'));
    }

    socket.data.user = toPublicUser(session.user);
    socket.data.sessionExpiresAt = session.expiresAt;
    socket.data.recentSends = [];
    return next();
  } catch (error) {
    console.error('[socket] Authentication error:', error.message);
    return next(authError('AUTH_FAILED', 'Could not verify your session'));
  }
}
