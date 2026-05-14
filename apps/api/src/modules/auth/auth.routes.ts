import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import {
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  refreshSchema,
  registerTenantSchema,
  switchWorkspaceSchema,
} from './auth.schema.ts';
import { createAuthService } from './auth.service.ts';

export const authRoutes = (deps: { db: Database }) => {
  const app = new Hono();
  const service = createAuthService(deps);

  // POST /auth/register-tenant — public
  app.post('/register-tenant', async (c) => {
    const body = registerTenantSchema.safeParse(await c.req.json());
    if (!body.success) {
      throw new HTTPException(400, { message: 'Invalid input' });
    }
    try {
      const result = await service.registerTenant(body.data);
      return c.json(ok(result), 201);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      if (msg.includes('users_email_unique') || msg.includes('users_phone_unique')) {
        return c.json(
          fail('auth.email_or_phone_taken', "Email yoki telefon allaqachon ro'yxatdan o'tgan"),
          409,
        );
      }
      throw err;
    }
  });

  // POST /auth/login — public
  app.post('/login', async (c) => {
    const body = loginSchema.safeParse(await c.req.json());
    if (!body.success) {
      throw new HTTPException(400, { message: 'Invalid input' });
    }
    const result = await service.login(body.data);
    if (!result) {
      return c.json(fail('auth.invalid_credentials', "Email/telefon yoki parol noto'g'ri"), 401);
    }
    return c.json(ok(result));
  });

  // POST /auth/refresh — public (token bo'lsa)
  app.post('/refresh', async (c) => {
    const body = refreshSchema.safeParse(await c.req.json());
    if (!body.success) {
      throw new HTTPException(400, { message: 'Invalid input' });
    }
    const result = await service.refresh(body.data);
    if (!result) {
      return c.json(
        fail('auth.invalid_refresh', "Refresh token noto'g'ri yoki muddati tugagan"),
        401,
      );
    }
    return c.json(ok(result));
  });

  // POST /auth/logout — public (refresh token bilan)
  app.post('/logout', async (c) => {
    const body = refreshSchema.safeParse(await c.req.json());
    if (!body.success) {
      return c.json(ok({ loggedOut: true }));
    }
    await service.logout(body.data.refreshToken);
    return c.json(ok({ loggedOut: true }));
  });

  // GET /auth/me — auth required
  app.get('/me', authMiddleware(), async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json(fail('auth.required', 'Authentication required'), 401);
    }
    const memberships = await service.getMemberships(user.id);
    return c.json(ok({ userId: user.id, ...memberships }));
  });

  // POST /auth/switch-workspace — auth required (no workspace yet OK)
  app.post('/switch-workspace', authMiddleware(), async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json(fail('auth.required', 'Authentication required'), 401);
    }
    const body = switchWorkspaceSchema.safeParse(await c.req.json());
    if (!body.success) {
      throw new HTTPException(400, { message: 'Invalid input' });
    }
    const result = await service.switchWorkspace(user.id, body.data);
    if (!result) {
      return c.json(fail('auth.no_workspace_access', "Bu workspace'da assignment yo'q"), 403);
    }
    return c.json(ok(result));
  });

  // POST /auth/password-reset-request — public, mock OTP
  app.post('/password-reset-request', async (c) => {
    const body = passwordResetRequestSchema.safeParse(await c.req.json());
    if (!body.success) {
      throw new HTTPException(400, { message: 'Invalid input' });
    }
    const result = await service.requestPasswordReset(body.data);
    return c.json(ok(result));
  });

  // POST /auth/password-reset — public
  app.post('/password-reset', async (c) => {
    const body = passwordResetSchema.safeParse(await c.req.json());
    if (!body.success) {
      throw new HTTPException(400, { message: 'Invalid input' });
    }
    const result = await service.resetPassword(body.data);
    if (!result) {
      return c.json(fail('auth.invalid_reset_token', "Token noto'g'ri yoki muddati tugagan"), 400);
    }
    return c.json(ok(result));
  });

  return app;
};
