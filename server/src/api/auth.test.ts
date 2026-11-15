// src/api/auth.test.ts
// Phase 21: Integration tests for auth endpoints — register, login, logout, me.

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

const app = createApp();

// Use a unique email per test run to avoid conflicts in the shared DB.
const TEST_EMAIL = `testuser-${Date.now()}@orchestrai-test.com`;
const TEST_PASSWORD = 'SecureP@ssw0rd!';
const TEST_NAME = 'Test User Phase21';
const TEST_ADDRESS = '42 Test Lane, Testville';

let sessionToken = '';
let createdUserId = '';

describe('POST /api/auth/register', () => {
  it('registers a new user and returns a token + user profile', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: TEST_EMAIL,
        name: TEST_NAME,
        defaultAddress: TEST_ADDRESS,
        password: TEST_PASSWORD,
      })
      .expect(201);

    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(20);

    expect(res.body.user).toMatchObject({
      email: TEST_EMAIL,
      name: TEST_NAME,
      defaultAddress: TEST_ADDRESS,
    });
    // passwordHash must NEVER be returned
    expect(res.body.user).not.toHaveProperty('passwordHash');

    sessionToken = res.body.token;
    createdUserId = res.body.user.id;
  });

  it('returns 409 when registering with a duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: TEST_EMAIL,
        name: 'Duplicate',
        defaultAddress: 'Somewhere',
        password: TEST_PASSWORD,
      })
      .expect(409);

    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: `short-${Date.now()}@test.com`,
        name: 'Short',
        defaultAddress: 'Addr',
        password: 'abc',
      })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when email is invalid', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'not-an-email',
        name: 'Bad Email',
        defaultAddress: 'Addr',
        password: TEST_PASSWORD,
      })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials and returns a token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(200);

    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.email).toBe(TEST_EMAIL);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 401 for wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'WrongPassword123' })
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 for non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@nowhere.invalid', password: TEST_PASSWORD })
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 400 when body is missing password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/auth/logout', () => {
  it('always returns 200 (stateless)', async () => {
    const res = await request(app).post('/api/auth/logout').expect(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/auth/me', () => {
  beforeAll(() => {
    // sessionToken is set during register describe block
  });

  it('returns the authenticated user profile with a valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${sessionToken}`)
      .expect(200);

    expect(res.body.user.id).toBe(createdUserId);
    expect(res.body.user.email).toBe(TEST_EMAIL);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/auth/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with a tampered token', async () => {
    const tampered = sessionToken.slice(0, -4) + 'XXXX';
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tampered}`)
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
