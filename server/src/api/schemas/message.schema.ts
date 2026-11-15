// src/api/schemas/message.schema.ts
// Phase 16: Zod validation schema for message dispatch endpoint.

import { z } from 'zod';

export const SendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message content must not be empty')
    .max(4000, 'Message content must not exceed 4000 characters'),
});

