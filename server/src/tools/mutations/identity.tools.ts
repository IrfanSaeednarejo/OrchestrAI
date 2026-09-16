import { z } from 'zod';
import { getUserById } from '../../persistence/repositories/marketplace.repository.js';
import { verificationService } from '../../services/verification.service.js';
import { ToolResult, ToolMetadata } from '../types.js';

const uuidSchema = z.string().uuid();

// --- start_identity_verification ---

export const StartIdentityVerificationInputSchema = z.object({
  userId: uuidSchema,
});

export type StartIdentityVerificationInput = z.infer<
  typeof StartIdentityVerificationInputSchema
>;

export async function startIdentityVerification(
  rawInput: unknown
): Promise<ToolResult<{ code: string }>> {
  const parsed = StartIdentityVerificationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  const { userId } = parsed.data;

  try {
    const user = await getUserById(userId);
    if (!user) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `User ${userId} not found.` },
      };
    }
  } catch (error) {
    return {
      success: false,
      error: { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : String(error) },
    };
  }

  const result = await verificationService.issueVerificationCode(userId);
  if ('error' in result) {
    return {
      success: false,
      error: { code: result.error, message: 'Service unavailable.' },
    };
  }

  return { success: true, data: { code: result.code } };
}

export const startIdentityVerificationMetadata: ToolMetadata = {
  name: 'start_identity_verification',
  requiredVerification: 'NONE',
};

// --- verify_identity ---

export const VerifyIdentityInputSchema = z.object({
  userId: uuidSchema,
  code: z.string().length(6),
});

export type VerifyIdentityInput = z.infer<typeof VerifyIdentityInputSchema>;

export async function verifyIdentity(
  rawInput: unknown
): Promise<ToolResult<{ verified: boolean }>> {
  const parsed = VerifyIdentityInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  const { userId, code } = parsed.data;

  try {
    const user = await getUserById(userId);
    if (!user) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `User ${userId} not found.` },
      };
    }
  } catch (error) {
    return {
      success: false,
      error: { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : String(error) },
    };
  }

  const result = await verificationService.checkVerificationCode(userId, code);

  if (result.success) {
    return { success: true, data: { verified: true } };
  } else {
    // Map the reason to the ToolResult error code format
    return {
      success: false,
      error: { code: result.reason, message: `Verification failed: ${result.reason}` },
    };
  }
}

export const verifyIdentityMetadata: ToolMetadata = {
  name: 'verify_identity',
  requiredVerification: 'NONE',
};
