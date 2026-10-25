import { Router } from 'express';
import { getCurrentUser, login, logout, register } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { issueCsrfToken } from '../middleware/csrf.js';
import { authRateLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../validation/schemas.js';

export const authRouter = Router();

authRouter.get('/csrf', issueCsrfToken);
authRouter.post('/register', authRateLimiter, validate({ body: registerSchema }), register);
authRouter.post('/login', authRateLimiter, validate({ body: loginSchema }), login);
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, getCurrentUser);
