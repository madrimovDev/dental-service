import { beforeEach, describe, expect, it } from 'bun:test';
import bcrypt from 'bcryptjs';
import { jwtVerify } from 'jose';
import { createApp } from '../../app';
import { db } from '../../db/client';
import { adminUsers } from '../../db/schema';
import { resetRateLimitStore } from '../../lib/rate-limit';

const app = createApp();

let email: string;
const password = 'correct-horse-battery-staple';

beforeEach(async () => {
  resetRateLimitStore();
  email = `admin-${crypto.randomUUID()}@test.com`;
  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(adminUsers).values({ email, passwordHash });
});

describe('POST /v1/admin/auth/login', () => {
  it('returns a JWT for valid email+password', async () => {
    const res = await app.request('/v1/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(typeof body.token).toBe('string');

    const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
    const { payload } = await jwtVerify(body.token, secret);
    expect(payload.sub).toBeTruthy();
  });

  it('returns 401 for wrong password', async () => {
    const res = await app.request('/v1/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong-password' }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 for unknown email', async () => {
    const res = await app.request('/v1/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@test.com', password }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid payload (bad email format)', async () => {
    const res = await app.request('/v1/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 429 after exceeding the login rate limit for the same IP+email', async () => {
    const ip = '10.99.1.1';
    let lastRes: Response | undefined;
    for (let i = 0; i < 11; i++) {
      lastRes = await app.request('/v1/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ email, password: 'wrong-password' }),
      });
    }
    expect(lastRes?.status).toBe(429);
    expect(lastRes?.headers.get('retry-after')).toBeTruthy();
    const body = (await lastRes?.json()) as any;
    expect(body.error.code).toBe('RATE_LIMITED');
  });
});
