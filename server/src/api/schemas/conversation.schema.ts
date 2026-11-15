// src/api/schemas/conversation.schema.ts
// Phase 16: Zod validation schemas for conversation endpoints.

import { z } from 'zod';

export const ConversationIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Conversation id must be a valid UUID' }),
});

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const StartConversationSchema = z.object({
  metadata: z.record(z.string(), z.unknown()).optional(),
});

