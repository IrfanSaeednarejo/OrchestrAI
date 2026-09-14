import { z } from 'zod';
import {
  getPaymentById,
  getOrderById,
  getCapturedPaymentsByUserId,
} from '../../persistence/repositories/marketplace.repository.js';
import { ToolResult, ToolMetadata } from '../types.js';

const uuidSchema = z.string().uuid();
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export const DetectDuplicateChargeInputSchema = z.object({
  paymentId: uuidSchema,
});

export const DetectDuplicateChargeOutputSchema = z.object({
  potentialDuplicate: z.boolean(),
  duplicatePaymentId: z.string().optional(),
  reason: z.string().optional(),
});

export type DetectDuplicateChargeInput = z.infer<typeof DetectDuplicateChargeInputSchema>;
export type DetectDuplicateChargeOutput = z.infer<typeof DetectDuplicateChargeOutputSchema>;

export async function detectDuplicateCharge(
  rawInput: unknown
): Promise<ToolResult<DetectDuplicateChargeOutput>> {
  const parsed = DetectDuplicateChargeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  try {
    const targetPayment = await getPaymentById(parsed.data.paymentId);
    if (!targetPayment) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `Payment ${parsed.data.paymentId} not found.` },
      };
    }

    const order = await getOrderById(targetPayment.orderId);
    if (!order) {
      // Issue #4 Fix: Missing order for a valid paymentId represents a data-integrity anomaly
      return {
        success: false,
        error: {
          code: 'DATA_INTEGRITY_ERROR',
          message: `Order ${targetPayment.orderId} referenced by payment ${parsed.data.paymentId} not found.`,
        },
      };
    }

    const capturedPayments = await getCapturedPaymentsByUserId(order.userId);
    const targetTime = targetPayment.createdAt.getTime();

    // Issue #5 Fix: Use direct string comparison for numeric(10,2) amounts (never float)
    const duplicate = capturedPayments.find((p) => {
      if (p.id === targetPayment.id) return false;
      if (p.orderId === targetPayment.orderId) return false;
      const sameAmount = p.amount === targetPayment.amount;
      const timeDiff = Math.abs(p.createdAt.getTime() - targetTime);
      return sameAmount && timeDiff <= TWENTY_FOUR_HOURS_MS;
    });

    if (duplicate) {
      return {
        success: true,
        data: {
          potentialDuplicate: true,
          duplicatePaymentId: duplicate.id,
          reason: 'Matching captured payment found on another order within 24 hours',
        },
      };
    }

    return {
      success: true,
      data: { potentialDuplicate: false },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'REPOSITORY_ERROR',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export const detectDuplicateChargeMetadata: ToolMetadata = {
  name: 'detect_duplicate_charge',
  requiredVerification: 'FULL',
};
