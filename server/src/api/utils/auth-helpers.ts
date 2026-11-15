// src/api/utils/auth-helpers.ts
// Phase 17 Step 1a: Shared conversation ownership authorization helper.

import type { Conversation } from '../../persistence/repositories/conversation.repository.js';
import { ForbiddenError, UnauthorizedError } from '../errors/app-error.js';
import { DEFAULT_GUEST_USER_ID } from '../middleware/auth.middleware.js';
import type { AuthenticatedUser } from '../types.js';
import type { User } from '../../persistence/repositories/marketplace.repository.js';

/** The union type that req.user may hold — mirrors the Express augmentation in types.ts. */
export type RequestUser = AuthenticatedUser | (User & { isGuest?: boolean });

/**
 * Asserts that the caller has permission to access the target conversation.
 * - Authenticated users can only access conversations where conversation.userId === caller.id.
 * - Guest users can ONLY access conversations where conversation.userId === DEFAULT_GUEST_USER_ID.
 * - No fail-open: missing caller or mismatch throws ForbiddenError / UnauthorizedError.
 */
export function assertConversationOwnership(
  conversation: Conversation,
  caller?: RequestUser | null
): void {
  if (!caller || !caller.id) {
    throw new UnauthorizedError('User identity could not be resolved');
  }

  const isGuest = ('isGuest' in caller && caller.isGuest === true) || caller.id === DEFAULT_GUEST_USER_ID;

  if (isGuest) {
    // Guest can strictly only access conversations owned by the guest user ID
    if (conversation.userId !== DEFAULT_GUEST_USER_ID) {
      throw new ForbiddenError('You do not have permission to access this conversation');
    }
    return;
  }

  // Authenticated user: must match conversation owner exactly
  if (conversation.userId !== caller.id) {
    throw new ForbiddenError('You do not have permission to access this conversation');
  }
}

