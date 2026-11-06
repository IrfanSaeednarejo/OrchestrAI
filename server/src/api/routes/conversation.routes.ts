import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateRequest } from '../middleware/validation.middleware.js';
import {
  ConversationIdParamSchema,
  PaginationQuerySchema,
  StartConversationSchema,
} from '../schemas/conversation.schema.js';
import { SendMessageSchema } from '../schemas/message.schema.js';
import {
  createConversationHandler,
  listConversationsHandler,
  getConversationHandler,
  getConversationMessagesHandler,
} from '../controllers/conversation.controller.js';
import { sendMessageHandler } from '../controllers/message.controller.js';
import { getTraceHandler } from '../controllers/trace.controller.js';

export const conversationRouter = Router();

// Apply auth to all conversation routes
conversationRouter.use(asyncHandler(authMiddleware));

conversationRouter.post(
  '/',
  validateRequest({ body: StartConversationSchema }),
  asyncHandler(createConversationHandler)
);

conversationRouter.get(
  '/',
  validateRequest({ query: PaginationQuerySchema }),
  asyncHandler(listConversationsHandler)
);

conversationRouter.get(
  '/:id',
  validateRequest({ params: ConversationIdParamSchema }),
  asyncHandler(getConversationHandler)
);

conversationRouter.get(
  '/:id/messages',
  validateRequest({ params: ConversationIdParamSchema }),
  asyncHandler(getConversationMessagesHandler)
);

conversationRouter.post(
  '/:id/messages',
  validateRequest({
    params: ConversationIdParamSchema,
    body: SendMessageSchema,
  }),
  asyncHandler(sendMessageHandler)
);

conversationRouter.get(
  '/:id/traces',
  validateRequest({ params: ConversationIdParamSchema }),
  asyncHandler(getTraceHandler)
);

