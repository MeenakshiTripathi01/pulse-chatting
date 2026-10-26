import { Router } from 'express';
import {
  createConversation,
  deleteConversation,
  deleteConversationMessage,
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
  messageParamsSchema,
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
conversationRouter.delete(
  '/:conversationId',
  validate({ params: conversationParamsSchema }),
  deleteConversation,
);
conversationRouter.get(
  '/:conversationId/messages',
  validate({ params: conversationParamsSchema, query: messageHistoryQuerySchema }),
  getMessages,
);
conversationRouter.delete(
  '/:conversationId/messages/:messageId',
  validate({ params: messageParamsSchema }),
  deleteConversationMessage,
);
