import { z } from 'zod';
import { getOrderById, getShipmentByOrderId } from '../../persistence/repositories/marketplace.repository.js';
import { ToolResult, ToolMetadata } from '../types.js';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

// ---------------------------------------------------------------------------
// get_order
// ---------------------------------------------------------------------------

export const GetOrderInputSchema = z.object({
  orderId: uuidSchema,
});

export const GetOrderOutputSchema = z.object({
  id: z.string(),
  userId: z.string(),
  status: z.enum(['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'returned']),
  shippingAddressSnapshot: z.string(),
  totalAmount: z.string(),
  createdAt: z.date(),
});

export type GetOrderInput = z.infer<typeof GetOrderInputSchema>;
export type GetOrderOutput = z.infer<typeof GetOrderOutputSchema>;

export async function getOrder(
  rawInput: unknown
): Promise<ToolResult<GetOrderOutput>> {
  const parsed = GetOrderInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  try {
    const order = await getOrderById(parsed.data.orderId);
    if (!order) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `Order ${parsed.data.orderId} not found.` },
      };
    }

    return { success: true, data: order };
  } catch (error) {
    return {
      success: false,
      error: { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export const getOrderMetadata: ToolMetadata = {
  name: 'get_order',
  requiredVerification: 'LIGHT',
};

// ---------------------------------------------------------------------------
// get_shipment_status
// ---------------------------------------------------------------------------

export const GetShipmentStatusInputSchema = z.object({
  orderId: uuidSchema,
});

export const GetShipmentStatusOutputSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  status: z.enum(['pending', 'in_transit', 'delivered', 'returned_to_sender']),
  trackingNumber: z.string().nullable(),
  estimatedDelivery: z.date().nullable(),
  carrier: z.string().nullable(),
});

export type GetShipmentStatusInput = z.infer<typeof GetShipmentStatusInputSchema>;
export type GetShipmentStatusOutput = z.infer<typeof GetShipmentStatusOutputSchema>;

export async function getShipmentStatus(
  rawInput: unknown
): Promise<ToolResult<GetShipmentStatusOutput>> {
  const parsed = GetShipmentStatusInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: 'INVALID_INPUT', message: parsed.error.message },
    };
  }

  try {
    const shipment = await getShipmentByOrderId(parsed.data.orderId);
    if (!shipment) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `No shipment found for order ${parsed.data.orderId}.` },
      };
    }

    return { success: true, data: shipment };
  } catch (error) {
    return {
      success: false,
      error: { code: 'REPOSITORY_ERROR', message: error instanceof Error ? error.message : String(error) },
    };
  }
}

export const getShipmentStatusMetadata: ToolMetadata = {
  name: 'get_shipment_status',
  requiredVerification: 'LIGHT',
};
