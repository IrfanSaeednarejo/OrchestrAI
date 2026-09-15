import { z } from 'zod';
import {
  getPaymentById,
  getRefundsByPaymentId,
  getReturnById,
  createRefund as createRefundRepo,
} from '../../persistence/repositories/marketplace.repository.js';
import { ToolResult, ToolMetadata } from '../types.js';

const uuidSchema = z.string().uuid();

export const CreateRefundInputSchema = z.object({
  paymentId: uuidSchema,
  returnId: uuidSchema.nullable(),
  amount: z.string(),
});

export const CreateRefundOutputSchema = z.object({
  id: z.string(),
  paymentId: z.string(),
  returnId: z.string().nullable(),
  amount: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  createdAt: z.date(),
});

export type CreateRefundInput = z.infer<typeof CreateRefundInputSchema>;
export type CreateRefundOutput = z.infer<typeof CreateRefundOutputSchema>;

export async function createRefund(
  rawInput: unknown
): Promise<ToolResult<CreateRefundOutput>> {
  const parsed = CreateRefundInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  try {
    const { paymentId, returnId, amount } = parsed.data;

    // 1. Look up the payment
    const payment = await getPaymentById(paymentId);
    if (!payment) {
      return {
        success: false,
        error: { code: 'PAYMENT_NOT_FOUND', message: `Payment ${paymentId} not found.` },
      };
    }

    // 2. Check payment status
    if (payment.status !== 'captured') {
      return {
        success: false,
        error: { code: 'PAYMENT_NOT_CAPTURED', message: `Payment ${paymentId} is not captured (status: ${payment.status}).` },
      };
    }

    // 3. Check for existing refunds
    const existingRefunds = await getRefundsByPaymentId(paymentId);
    const blockingRefundExists = existingRefunds.some(
      (r) => r.status === 'pending' || r.status === 'processing' || r.status === 'completed'
    );
    if (blockingRefundExists) {
      return {
        success: false,
        error: { code: 'REFUND_ALREADY_EXISTS', message: `A pending, processing, or completed refund already exists for payment ${paymentId}.` },
      };
    }

    // 4. Return-specific checks
    if (returnId !== null) {
      const ret = await getReturnById(returnId);
      if (!ret) {
        return {
          success: false,
          error: { code: 'RETURN_NOT_FOUND', message: `Return ${returnId} not found.` },
        };
      }
      if (ret.orderId !== payment.orderId) {
        return {
          success: false,
          error: { code: 'RETURN_ORDER_MISMATCH', message: `Return ${returnId} belongs to order ${ret.orderId}, but payment ${paymentId} belongs to order ${payment.orderId}.` },
        };
      }
      if (ret.status !== 'approved') {
        return {
          success: false,
          error: { code: 'RETURN_NOT_APPROVED', message: `Return ${returnId} has status ${ret.status}, expected 'approved'.` },
        };
      }
    }

    // 5. Check amount match
    if (amount !== payment.amount) {
      return {
        success: false,
        error: { code: 'AMOUNT_MISMATCH', message: `Refund amount ${amount} does not match payment amount ${payment.amount}.` },
      };
    }

    // 6. Create refund
    const newRefund = await createRefundRepo({
      paymentId,
      returnId,
      amount,
      status: 'pending',
    });

    return { success: true, data: newRefund };
  } catch (error) {
    return {
      success: false,
      error: { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export const createRefundMetadata: ToolMetadata = {
  name: 'create_refund',
  requiredVerification: 'FULL',
};
