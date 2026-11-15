// src/api/order-placement.test.ts
// Phase 21: Integration tests for storefront and order placement endpoints.

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

const app = createApp();

// Shared state across describe blocks
let authToken = '';
let firstProductId = '';

// Register a fresh user for storefront tests
beforeAll(async () => {
  const email = `storefront-${Date.now()}@orchestrai-test.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      email,
      name: 'Storefront Tester',
      defaultAddress: '10 Commerce Ave, Shopville',
      password: 'StrongPass1234!',
    });

  authToken = res.body.token;
});

describe('GET /api/products', () => {
  it('lists all products without authentication', async () => {
    const res = await request(app).get('/api/products').expect(200);

    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.products.length).toBeGreaterThan(0);

    const product = res.body.products[0];
    expect(product).toHaveProperty('id');
    expect(product).toHaveProperty('name');
    expect(product).toHaveProperty('price');
    expect(product).toHaveProperty('sku');

    firstProductId = product.id;
  });
});

describe('GET /api/orders', () => {
  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/orders').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns an empty or populated array for authenticated user', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(res.body.orders)).toBe(true);
  });
});

describe('POST /api/orders', () => {
  it('returns 401 without authentication', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ items: [{ productId: firstProductId, quantity: 1 }] })
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('places an order and returns order + trackingNumber', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ items: [{ productId: firstProductId, quantity: 2 }] })
      .expect(201);

    expect(res.body.order).toHaveProperty('id');
    expect(res.body.order.status).toBe('paid');
    expect(res.body).toHaveProperty('trackingNumber');
    expect(typeof res.body.trackingNumber).toBe('string');
    expect(res.body.trackingNumber.startsWith('OAI-')).toBe(true);
  });

  it('order appears in GET /api/orders after placement', async () => {
    // Place another order
    await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ items: [{ productId: firstProductId, quantity: 1 }] })
      .expect(201);

    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(res.body.orders.length).toBeGreaterThanOrEqual(2);
    const statuses = res.body.orders.map((o: { status: string }) => o.status);
    expect(statuses.every((s: string) => s === 'paid')).toBe(true);
  });

  it('returns 400 when items array is empty', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ items: [] })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 when productId does not exist', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ items: [{ productId: '00000000-0000-4000-a000-000000000099', quantity: 1 }] })
      .expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 when quantity is 0', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ items: [{ productId: firstProductId, quantity: 0 }] })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
