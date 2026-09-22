import { IdentityState, ConversationStateUpdate } from './conversation-state.js';

export type BuildIdentityUpdateInput = {
  status: IdentityState['status'];
  verificationMethod: string | null;
  verifiedAt: string | null;
};

export function buildIdentityUpdate(input: BuildIdentityUpdateInput): ConversationStateUpdate {
  if (input.status === 'UNVERIFIED') {
    if (input.verificationMethod !== null || input.verifiedAt !== null) {
      throw new Error("Invalid identity update: when status is 'UNVERIFIED', verificationMethod and verifiedAt must be null.");
    }
  } else {
    if (input.verificationMethod === null || input.verifiedAt === null) {
      throw new Error(`Invalid identity update: when status is '${input.status}', verificationMethod and verifiedAt must not be null.`);
    }
  }

  // This function does NOT decide whether a transition (e.g. LIGHTLY_VERIFIED -> UNVERIFIED) is
  // policy-valid — only that the resulting object is internally well-formed.
  return {
    identity: {
      status: input.status,
      verificationMethod: input.verificationMethod,
      verifiedAt: input.verifiedAt,
    },
  };
}
