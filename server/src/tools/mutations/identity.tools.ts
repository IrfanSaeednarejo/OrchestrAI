import { z } from 'zod';
import { getUserById } from '../../persistence/repositories/marketplace.repository.js';
import {
  verificationService,
  VERIFICATION_CODE_TTL_SECONDS,
} from '../../services/verification.service.js';
import { renderVerificationCodeEmail } from '../../services/email-templates/verification-code.js';
import { sendEmail } from '../../services/email.service.js';
import { ToolResult, ToolMetadata } from '../types.js';

const uuidSchema = z.string().uuid();

// --- start_identity_verification ---

export const StartIdentityVerificationInputSchema = z.object({
  userId: uuidSchema,
});

export type StartIdentityVerificationInput = z.infer<
  typeof StartIdentityVerificationInputSchema
>;

export interface StartIdentityVerificationOutput {
  sent: true;
  maskedEmail: string;
  expiresInSeconds: number;
}

function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) {
    return '***';
  }
  const firstChar = email.charAt(0);
  const domain = email.slice(atIndex);
  return `${firstChar}***${domain}`;
}

export async function startIdentityVerification(
  rawInput: unknown
): Promise<ToolResult<StartIdentityVerificationOutput>> {
  const parsed = StartIdentityVerificationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  const { userId } = parsed.data;

  let user;
  try {
    user = await getUserById(userId);
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
    if (result.error === 'RESEND_COOLDOWN') {
      return {
        success: false,
        error: {
          code: 'RESEND_COOLDOWN',
          message: `Please wait ${result.retryAfterSeconds} seconds before requesting a new code.`,
        },
      };
    }

    const message =
      result.error === 'MAX_ATTEMPTS_EXCEEDED'
        ? 'Maximum verification attempts exceeded. Please wait 10 minutes before requesting a new code.'
        : 'Service unavailable.';
    return {
      success: false,
      error: { code: result.error, message },
    };
  }

  const ttlMinutes = Math.floor(VERIFICATION_CODE_TTL_SECONDS / 60);
  let emailContent;
  try {
    emailContent = renderVerificationCodeEmail({
      name: user.name,
      code: result.code,
      ttlMinutes,
    });
  } catch {
    await verificationService.revokeVerificationCode(userId);
    return {
      success: false,
      error: {
        code: 'EMAIL_SEND_FAILED',
        message: 'Failed to prepare verification email.',
      },
    };
  }

  try {
    const sendResult = await sendEmail({
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    if (!sendResult.success) {
      await verificationService.revokeVerificationCode(userId);
      return {
        success: false,
        error: {
          code: sendResult.error.code,
          message: 'Failed to deliver verification email. Please try again later.',
        },
      };
    }
  } catch {
    await verificationService.revokeVerificationCode(userId);
    return {
      success: false,
      error: {
        code: 'EMAIL_SEND_FAILED',
        message: 'Failed to deliver verification email. Please try again later.',
      },
    };
  }

  return {
    success: true,
    data: {
      sent: true,
      maskedEmail: maskEmail(user.email),
      expiresInSeconds: VERIFICATION_CODE_TTL_SECONDS,
    },
  };
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
  sensitiveInputFields: ['code'],
};

// --- initiate_password_reset ---

export const InitiatePasswordResetInputSchema = z.object({
  userId: uuidSchema,
});

export const InitiatePasswordResetOutputSchema = z.object({
  acknowledged: z.boolean(),
});

export type InitiatePasswordResetInput = z.infer<typeof InitiatePasswordResetInputSchema>;
export type InitiatePasswordResetOutput = z.infer<typeof InitiatePasswordResetOutputSchema>;

export async function initiatePasswordReset(
  rawInput: unknown
): Promise<ToolResult<InitiatePasswordResetOutput>> {
  const parsed = InitiatePasswordResetInputSchema.safeParse(rawInput);
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

    // Guarantees: No Redis usage, no token generation, no ConversationState/IdentityState modification.
    return { success: true, data: { acknowledged: true } };
  } catch (error) {
    return {
      success: false,
      error: { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export const initiatePasswordResetMetadata: ToolMetadata = {
  name: 'initiate_password_reset',
  requiredVerification: 'NONE',
};
