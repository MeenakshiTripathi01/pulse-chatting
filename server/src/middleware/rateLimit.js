import { rateLimit } from 'express-rate-limit';
import { config } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/** Slows down password guessing and mass sign-ups: N attempts per IP per 15 minutes. */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.authRateLimitMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler(_req, _res, next) {
    next(
      new AppError(
        429,
        'Too many attempts. Please wait a few minutes and try again.',
        'RATE_LIMITED',
      ),
    );
  },
});
