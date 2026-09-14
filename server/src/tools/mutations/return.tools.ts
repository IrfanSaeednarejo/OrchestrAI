import { z } from 'zod';
import { evaluateReturnEligibility } from '../business/return-eligibility.js';
import { createReturn as createReturnRepo } from '../../persistence/repositories/marketplace.repository.js';
import { ToolResult, ToolMetadata } from '../types.js';

const uuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// check_return_eligibility
// ---------------------------------------------------------------------------

export const CheckReturnEligibilityInputSchema = z.object({
  orderId: uuidSchema,
});

export const CheckReturnEligibilityOutputSchema = z.object({
  eligible: z.boolean(),
  reason: z.string().optional(),
  deliveredAt: z.date().optional(),
  daysSinceDelivery: z.number().optional(),
});

export type CheckReturnEligibilityInput = z.infer<typeof CheckReturnEligibilityInputSchema>;
export type CheckReturnEligibilityOutput = z.infer<typeof CheckReturnEligibilityOutputSchema>;

export async function checkReturnEligibility(
  rawInput: unknown
): Promise<ToolResult<CheckReturnEligibilityOutput>> {
  const parsed = CheckReturnEligibilityInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  try {
    const result = await evaluateReturnEligibility(parsed.data.orderId);
    if (result.eligible) {
      return {
        success: true,
        data: {
          eligible: true,
          deliveredAt: result.deliveredAt,
          daysSinceDelivery: result.daysSinceDelivery,
        },
      };
    }
    return { success: true, data: { eligible: false, reason: result.reason } };
  } catch (error) {
    return {
      success: false,
      error: { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export const checkReturnEligibilityMetadata: ToolMetadata = {
  name: 'check_return_eligibility',
  requiredVerification: 'LIGHT',
};

// ---------------------------------------------------------------------------
// create_return
// ---------------------------------------------------------------------------

export const CreateReturnInputSchema = z.object({
  orderId: uuidSchema,
  reason: z.string().min(1, 'Reason is required'),
});

export const CreateReturnOutputSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  status: z.enum(['requested', 'approved', 'rejected', 'in_transit', 'received', 'completed']),
  reason: z.string(),
  createdAt: z.date(),
});

export type CreateReturnInput = z.infer<typeof CreateReturnInputSchema>;
export type CreateReturnOutput = z.infer<typeof CreateReturnOutputSchema>;

export async function createReturn(
  rawInput: unknown
): Promise<ToolResult<CreateReturnOutput>> {
  const parsed = CreateReturnInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  try {
    const eligibility = await evaluateReturnEligibility(parsed.data.orderId);
    if (!eligibility.eligible) {
      return {
        success: false,
        error: { code: eligibility.reason, message: `Return not eligible: ${eligibility.reason}` },
      };
    }

    const newReturn = await createReturnRepo({
      orderId: parsed.data.orderId,
      reason: parsed.data.reason,
      status: 'requested',
    });

    return { success: true, data: newReturn };
  } catch (error) {
    return {
      success: false,
      error: { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export const createReturnMetadata: ToolMetadata = {
  name: 'create_return',
  requiredVerification: 'FULL',
};
