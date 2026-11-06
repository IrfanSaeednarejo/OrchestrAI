// src/api/types.ts
// Phase 16: Common API type contracts and Express request extensions.

import type { User } from '../persistence/repositories/marketplace.repository.js';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  name?: string;
  isGuest?: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser | User;
    }
  }
}

