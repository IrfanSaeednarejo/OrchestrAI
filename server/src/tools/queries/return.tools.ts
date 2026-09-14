import { z } from 'zod';
import { getReturnById, getReturnsByOrderId } from '../../persistence/repositories/marketplace.repository.js';
import { ToolResult, ToolMetadata } from '../types.js';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

const ReturnOutputSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  status: z.enum(['requested', 'approved', 'rejected', 'in_transit', 'received', 'completed']),
  reason: z.string(),
  createdAt: z.date(),
});

// ---------------------------------------------------------------------------
// get_return_status
// ---------------------------------------------------------------------------

export const GetReturnStatusInputSchema = z.object({
  returnId: uuidSchema,
});

export const GetReturnStatusOutputSchema = ReturnOutputSchema;

export type GetReturnStatusInput = z.infer<typeof GetReturnStatusInputSchema>;
export type GetReturnStatusOutput = z.infer<typeof GetReturnStatusOutputSchema>;

export async function getReturnStatus(
  rawInput: unknown
): Promise<ToolResult<GetReturnStatusOutput>> {
  const parsed = GetReturnStatusInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  try {
    const ret = await getReturnById(parsed.data.returnId);
    if (!ret) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `Return ${parsed.data.returnId} not found.` },
      };
    }

    return { success: true, data: ret };
  } catch (error) {
    return {
      success: false,
      error: { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export const getReturnStatusMetadata: ToolMetadata = {
  name: 'get_return_status',
  requiredVerification: 'LIGHT',
};

// ---------------------------------------------------------------------------
// get_return_by_order
// ---------------------------------------------------------------------------

export const GetReturnByOrderInputSchema = z.object({
  orderId: uuidSchema,
});

export const GetReturnByOrderOutputSchema = z.array(ReturnOutputSchema);

export type GetReturnByOrderInput = z.infer<typeof GetReturnByOrderInputSchema>;
export type GetReturnByOrderOutput = z.infer<typeof GetReturnByOrderOutputSchema>;

export async function getReturnByOrder(
  rawInput: unknown
): Promise<ToolResult<GetReturnByOrderOutput>> {
  const parsed = GetReturnByOrderInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  try {
    const results = await getReturnsByOrderId(parsed.data.orderId);
    return { success: true, data: results };
  } catch (error) {
    return {
      success: false,
      error: { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export const getReturnByOrderMetadata: ToolMetadata = {
  name: 'get_return_by_order',
  // LIGHT: flagged gap in Verification Policy Matrix (Section 5). Same risk profile
  // as get_return_status (read-only lookup of return state by order rather than
  // by return ID). Treated as LIGHT pending formal matrix update.
  requiredVerification: 'LIGHT',
};
