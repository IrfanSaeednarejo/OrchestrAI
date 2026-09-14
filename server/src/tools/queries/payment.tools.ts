import { z } from 'zod';
import { getPaymentByOrderId, getRefundById } from '../../persistence/repositories/marketplace.repository.js';
import { ToolResult, ToolMetadata } from '../types.js';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// get_payment
// ---------------------------------------------------------------------------

export const GetPaymentInputSchema = z.object({
  orderId: uuidSchema,
});

export const GetPaymentOutputSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  amount: z.string(),
  status: z.enum(['pending', 'authorized', 'captured', 'failed', 'refunded']),
  method: z.string(),
  createdAt: z.date(),
});

export type GetPaymentInput = z.infer<typeof GetPaymentInputSchema>;
export type GetPaymentOutput = z.infer<typeof GetPaymentOutputSchema>;

export async function getPayment(
  rawInput: unknown
): Promise<ToolResult<GetPaymentOutput>> {
  const parsed = GetPaymentInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  try {
    const payment = await getPaymentByOrderId(parsed.data.orderId);
    if (!payment) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `No payment found for order ${parsed.data.orderId}.` },
      };
    }

    return { success: true, data: payment };
  } catch (error) {
    return {
      success: false,
      error: { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export const getPaymentMetadata: ToolMetadata = {
  name: 'get_payment',
  requiredVerification: 'FULL',
};

// ---------------------------------------------------------------------------
// get_refund_status
// ---------------------------------------------------------------------------

export const GetRefundStatusInputSchema = z.object({
  refundId: uuidSchema,
});

export const GetRefundStatusOutputSchema = z.object({
  id: z.string(),
  paymentId: z.string(),
  returnId: z.string().nullable(),
  amount: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  createdAt: z.date(),
});

export type GetRefundStatusInput = z.infer<typeof GetRefundStatusInputSchema>;
export type GetRefundStatusOutput = z.infer<typeof GetRefundStatusOutputSchema>;

export async function getRefundStatus(
  rawInput: unknown
): Promise<ToolResult<GetRefundStatusOutput>> {
  const parsed = GetRefundStatusInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  try {
    const refund = await getRefundById(parsed.data.refundId);
    if (!refund) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `Refund ${parsed.data.refundId} not found.` },
      };
    }

    return { success: true, data: refund };
  } catch (error) {
    return {
      success: false,
      error: { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export const getRefundStatusMetadata: ToolMetadata = {
  name: 'get_refund_status',
  requiredVerification: 'FULL',
};
