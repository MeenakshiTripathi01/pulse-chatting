import { registerUser, signAccessToken, signInOrCreateUser } from '../services/authService.js';
import { clearAuthCookie, setAuthCookie } from '../utils/cookies.js';
import { toPublicUser } from '../utils/serializers.js';

export async function register(req, res) {
  const user = await registerUser(req.valid.body);
  setAuthCookie(res, signAccessToken(user._id));
  res.status(201).json({ user: toPublicUser(user) });
}

export async function login(req, res) {
  const { user, created } = await signInOrCreateUser(req.valid.body);
  setAuthCookie(res, signAccessToken(user._id));
  res.status(created ? 201 : 200).json({ user: toPublicUser(user), created });
}

export function logout(_req, res) {
  clearAuthCookie(res);
  res.status(204).end();
}

export function getCurrentUser(req, res) {
  res.json({ user: toPublicUser(req.user) });
}
