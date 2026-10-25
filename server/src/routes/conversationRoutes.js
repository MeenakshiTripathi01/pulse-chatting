import { Router } from 'express';
import {
  createConversation,
  getConversation,
  getConversations,
  getMessages,
} from '../controllers/conversationController.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  conversationParamsSchema,
  createConversationSchema,
  messageHistoryQuerySchema,
} from '../validation/schemas.js';

export const conversationRouter = Router();

conversationRouter.use(requireAuth);
conversationRouter.get('/', getConversations);
conversationRouter.post('/', validate({ body: createConversationSchema }), createConversation);
conversationRouter.get(
  '/:conversationId',
  validate({ params: conversationParamsSchema }),
  getConversation,
);
conversationRouter.get(
  '/:conversationId/messages',
  validate({ params: conversationParamsSchema, query: messageHistoryQuerySchema }),
  getMessages,
);
