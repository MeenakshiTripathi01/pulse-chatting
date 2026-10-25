import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

// Cost factor: each +1 doubles hashing time. 12 is a common production choice; tests use the
// minimum so the suite stays fast.
const SALT_ROUNDS = config.nodeEnv === 'test' ? 4 : 12;

// Compared against when the email does not exist, so "unknown email" and "wrong password"
// take about the same time and an attacker cannot tell them apart.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing', SALT_ROUNDS);

export async function registerUser({ name, email, password }) {
  if (await User.exists({ email })) {
    throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    return await User.create({ name, email, passwordHash });
  } catch (error) {
    // Two simultaneous sign-ups can both pass the check above; the unique index catches it.
    if (error.code === 11000) {
      throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
    }
    throw error;
  }
}

export async function authenticateUser({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!user || !passwordMatches) {
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  return user;
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
