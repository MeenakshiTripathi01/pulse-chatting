import { authenticateUser, registerUser, signAccessToken } from '../services/authService.js';
import { clearAuthCookie, setAuthCookie } from '../utils/cookies.js';
import { toPublicUser } from '../utils/serializers.js';

export async function register(req, res) {
  const user = await registerUser(req.valid.body);
  setAuthCookie(res, signAccessToken(user._id));
  res.status(201).json({ user: toPublicUser(user) });
}

export async function login(req, res) {
  const user = await authenticateUser(req.valid.body);
  setAuthCookie(res, signAccessToken(user._id));
  res.json({ user: toPublicUser(user) });
}

export function logout(_req, res) {
  clearAuthCookie(res);
  res.status(204).end();
}

export function getCurrentUser(req, res) {
  res.json({ user: toPublicUser(req.user) });
}
