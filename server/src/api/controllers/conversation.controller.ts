// src/api/controllers/conversation.controller.ts
// Phase 16: Controller handlers for conversation lifecycle and message history.

import type { Request, Response } from 'express';
import {
  startConversation,
} from '../../services/conversation-lifecycle.service.js';
import {
  getConversationById,
  getConversationsByUserId,
  getMessagesByConversationId,
} from '../../persistence/repositories/conversation.repository.js';
import { NotFoundError, ForbiddenError, UnauthorizedError } from '../errors/app-error.js';
import { DEFAULT_GUEST_USER_ID } from '../middleware/auth.middleware.js';

export async function createConversationHandler(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('User identity could not be resolved');
  }

  const conversation = await startConversation(userId);

  res.status(201).json({
    conversation,
  });
}

export async function listConversationsHandler(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new UnauthorizedError('User identity could not be resolved');
  }

  const limit = req.query.limit !== undefined ? Number(req.query.limit) : 20;
  const offset = req.query.offset !== undefined ? Number(req.query.offset) : 0;

  const conversations = await getConversationsByUserId(userId, limit, offset);

  res.status(200).json({
    conversations,
    pagination: {
      limit,
      offset,
      count: conversations.length,
    },
  });
}

export async function getConversationHandler(
  req: Request,
  res: Response
): Promise<void> {
  const rawId = req.params.id;
  const conversationId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!conversationId) {
    throw new NotFoundError('Conversation ID is required');
  }

  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    throw new NotFoundError(`Conversation with id "${conversationId}" not found`);
  }

  const callerId = req.user?.id;
  // Security check: ensure caller owns conversation (unless guest session)
  if (
    callerId &&
    callerId !== DEFAULT_GUEST_USER_ID &&
    conversation.userId !== callerId
  ) {
    throw new ForbiddenError('You do not have permission to view this conversation');
  }

  res.status(200).json({
    conversation,
  });
}

export async function getConversationMessagesHandler(
  req: Request,
  res: Response
): Promise<void> {
  const rawId = req.params.id;
  const conversationId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!conversationId) {
    throw new NotFoundError('Conversation ID is required');
  }

  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    throw new NotFoundError(`Conversation with id "${conversationId}" not found`);
  }

  const callerId = req.user?.id;
  if (
    callerId &&
    callerId !== DEFAULT_GUEST_USER_ID &&
    conversation.userId !== callerId
  ) {
    throw new ForbiddenError('You do not have permission to view messages for this conversation');
  }

  const messages = await getMessagesByConversationId(conversationId);

  res.status(200).json({
    conversationId,
    messages,
  });
}

