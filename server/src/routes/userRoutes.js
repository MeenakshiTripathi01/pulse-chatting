import { Router } from 'express';
import { listUsers } from '../controllers/userController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { userSearchQuerySchema } from '../validation/schemas.js';

export const userRouter = Router();

userRouter.use(requireAuth);
userRouter.get('/', validate({ query: userSearchQuerySchema }), listUsers);
