// src/api/routes/order.routes.ts
// Phase 21: Storefront and order placement REST endpoints.
//
// GET  /api/products  — public product catalogue (no auth required).
// GET  /api/orders    — authenticated user's order history.
// POST /api/orders    — place a real order (auth required).

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../../persistence/db/client.js';
import { products } from '../../persistence/db/schema.js';
import { getOrdersByUserId } from '../../persistence/repositories/marketplace.repository.js';
import { placeOrder } from '../../persistence/repositories/order-placement.repository.js';
import { authMiddleware, requireAuth } from '../middleware/auth.middleware.js';
import { ValidationError } from '../errors/app-error.js';
import type { User } from '../../persistence/repositories/marketplace.repository.js';

export const orderRouter = Router();

// ── Zod schemas ──────────────────────────────────────────────────────────────

const OrderLineSchema = z.object({
  productId: z.string().uuid('productId must be a UUID'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(100),
});

const PlaceOrderSchema = z.object({
  items: z.array(OrderLineSchema).min(1, 'Must include at least one item'),
});

// ── GET /api/products ────────────────────────────────────────────────────────

orderRouter.get(
  '/products',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rows = await db
        .select({
          id: products.id,
          name: products.name,
          price: products.price,
          sku: products.sku,
        })
        .from(products);

      res.status(200).json({ products: rows });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /api/orders ──────────────────────────────────────────────────────────

orderRouter.get(
  '/orders',
  authMiddleware,
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req.user as User).id;
      const userOrders = await getOrdersByUserId(userId);
      res.status(200).json({ orders: userOrders });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/orders ─────────────────────────────────────────────────────────

orderRouter.post(
  '/orders',
  authMiddleware,
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = PlaceOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError('Invalid order data', parsed.error.flatten().fieldErrors);
      }

      const user = req.user as User;
      const result = await placeOrder(user.id, user.defaultAddress, parsed.data.items);

      res.status(201).json({
        order: result.order,
        trackingNumber: result.trackingNumber,
      });
    } catch (err) {
      next(err);
    }
  },
);

