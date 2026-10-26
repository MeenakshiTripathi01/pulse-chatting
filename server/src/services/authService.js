import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { newPasswordSchema } from '../validation/schemas.js';

// Cost factor: each +1 doubles hashing time. 12 is a common production choice; tests use the
// minimum so the suite stays fast.
const SALT_ROUNDS = config.nodeEnv === 'test' ? 4 : 12;

/** "meenakshi.tripathi01@gmail.com" -> "Meenakshi Tripathi01" (User.name needs 2–50 chars). */
export function nameFromEmail(email) {
  const words = email
    .split('@')[0]
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1));
  const name = words.join(' ').slice(0, 50).trim();
  return name.length >= 2 ? name : email.slice(0, 50);
}

const emailTaken = () =>
  AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
const usernameTaken = () =>
  AppError.conflict('This username is already taken. Try another one.', 'USERNAME_TAKEN');

/** Maps a duplicate-key error from the unique indexes to the matching friendly error. */
function toDuplicateError(error) {
  if (error.code !== 11000) return error;
  return error.keyPattern?.username ? usernameTaken() : emailTaken();
}

export async function registerUser({ name, username, email, password }) {
  if (await User.exists({ email })) throw emailTaken();
  if (username && (await User.exists({ username }))) throw usernameTaken();

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    return await User.create({ name, username, email, passwordHash });
  } catch (error) {
    // Two simultaneous sign-ups can both pass the checks above; the unique indexes catch it.
    throw toDuplicateError(error);
  }
}

function fieldError(field, message, code = 'VALIDATION_ERROR') {
  return AppError.badRequest(message, code, { [field]: message });
}

/**
 * Logs in an existing account, or creates one when the email is new (a username is then
 * required). An existing account without a username gets the one provided.
 * Resolves to `{ user, created }`.
 */
export async function signInOrCreateUser({ email, password, username }) {
  const existing = await User.findOne({ email }).select('+passwordHash');
  if (existing) {
    if (!(await bcrypt.compare(password, existing.passwordHash))) {
      throw AppError.unauthorized(
        'Incorrect password for this email. If you forgot it, use a different email to start a new account.',
        'WRONG_PASSWORD',
      );
    }
    if (username && !existing.username) {
      existing.username = username;
      try {
        await existing.save();
      } catch (error) {
        throw toDuplicateError(error);
      }
    }
    return { user: existing, created: false };
  }

  const passwordCheck = newPasswordSchema.safeParse(password);
  if (!passwordCheck.success) {
    throw fieldError('password', passwordCheck.error.issues[0].message);
  }
  if (!username) {
    // The login page shows its username field only after this response.
    throw fieldError('username', 'Choose a username to create your account', 'USERNAME_REQUIRED');
  }

  try {
    const user = await registerUser({ name: nameFromEmail(email), username, email, password });
    return { user, created: true };
  } catch (error) {
    // Someone created this email between our lookup and insert: treat it as a normal login.
    if (error.code === 'EMAIL_TAKEN') return signInOrCreateUser({ email, password, username });
    throw error;
  }
}

export function signAccessToken(userId) {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresInSeconds,
  });
}

/**
 * Resolves a JWT to `{ user, expiresAt }`. Returns null for any invalid, expired or orphaned
 * token. Used by both the REST middleware and the Socket.IO handshake so they behave the same.
 */
export async function getSessionFromToken(token) {
  if (!token) return null;

  let payload;
  try {
    // Pinning the algorithm prevents "alg: none" and algorithm-confusion attacks.
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    return null;
  }

  if (!mongoose.isValidObjectId(payload.sub)) return null;

  const user = await User.findById(payload.sub).lean();
  if (!user) return null;

  return { user, expiresAt: payload.exp * 1000 };
}
