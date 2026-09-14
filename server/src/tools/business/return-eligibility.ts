import {
  getOrderById,
  getShipmentByOrderId,
  getReturnsByOrderId,
} from '../../persistence/repositories/marketplace.repository.js';

export type ReturnEligibilityReason =
  | 'ORDER_NOT_FOUND'
  | 'ORDER_NOT_DELIVERED'
  | 'RETURN_WINDOW_EXPIRED'
  | 'RETURN_ALREADY_EXISTS';

export type ReturnEligibilityResult =
  | {
      eligible: true;
      deliveredAt: Date;
      daysSinceDelivery: number;
    }
  | { eligible: false; reason: ReturnEligibilityReason };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function evaluateReturnEligibility(
  orderId: string,
  now: Date = new Date()
): Promise<ReturnEligibilityResult> {
  const order = await getOrderById(orderId);
  if (!order) {
    return { eligible: false, reason: 'ORDER_NOT_FOUND' };
  }

  // Issue #1 Fix: Primary gate must be order.status === 'delivered'
  if (order.status !== 'delivered') {
    return { eligible: false, reason: 'ORDER_NOT_DELIVERED' };
  }

  const shipment = await getShipmentByOrderId(orderId);
  if (!shipment || !shipment.deliveredAt) {
    // Data-integrity fallback: order status is delivered, but shipment/deliveredAt is missing
    return { eligible: false, reason: 'ORDER_NOT_DELIVERED' };
  }

  const deliveredAt = new Date(shipment.deliveredAt);
  const diffMs = now.getTime() - deliveredAt.getTime();

  if (diffMs > THIRTY_DAYS_MS) {
    return { eligible: false, reason: 'RETURN_WINDOW_EXPIRED' };
  }

  const existingReturns = await getReturnsByOrderId(orderId);
  // Issue #2: Held pending user confirmation. Currently filtering non-rejected returns.
  const activeReturn = existingReturns.find((r) => r.status !== 'rejected');
  if (activeReturn) {
    return { eligible: false, reason: 'RETURN_ALREADY_EXISTS' };
  }

  // Issue #3 Fix: Return deliveredAt and daysSinceDelivery on eligible branch
  const daysSinceDelivery = Math.floor(diffMs / ONE_DAY_MS);

  return {
    eligible: true,
    deliveredAt,
    daysSinceDelivery,
  };
}
