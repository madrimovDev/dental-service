import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import {
  changePasswordSchema,
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
      // Drizzle DrizzleQueryError'da haqiqiy postgres xato cause ichida bo'ladi
      const stack =
        err instanceof Error
          ? `${err.message}\n${(err as Error & { cause?: unknown }).cause ?? ''}`
          : 'unknown';
      if (stack.includes('users_phone_unique') || stack.includes('users_email_unique')) {
        return c.json(
          fail('auth.phone_taken', "Bu telefon raqami allaqachon ro'yxatdan o'tgan"),
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
    if (!result.ok) {
      const msgs: Record<string, [string, number]> = {
        'auth.invalid_refresh': ["Refresh token noto'g'ri yoki muddati tugagan", 401],
        'auth.refresh_mismatch': ['Refresh token boshqa foydalanuvchiniki', 401],
        'auth.refresh_revoked': ['Refresh token allaqachon revoke qilingan', 401],
        'auth.no_workspace_access': ["Bu workspace'da ruxsat yo'q", 403],
        'auth.invalid_branch': ['Filial bu klinikaga tegishli emas', 400],
        'auth.user_not_found': ['Foydalanuvchi topilmadi', 404],
      };
      const [msg, status] = msgs[result.code] ?? ['Workspace switch failed', 403];
      return c.json(fail(result.code, msg), status as 400 | 401 | 403 | 404);
    }
    return c.json(
      ok({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        accessExpiresAt: result.accessExpiresAt,
      }),
    );
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

  // POST /auth/change-password — authenticated, joriy parol bilan
  app.post('/change-password', authMiddleware(), async (c) => {
    const user = c.get('user');
    if (!user) return c.json(fail('auth.required', 'Authentication required'), 401);

    const body = changePasswordSchema.safeParse(await c.req.json());
    if (!body.success) {
      throw new HTTPException(400, { message: 'Invalid input' });
    }
    const result = await service.changePassword(user.id, body.data);
    if (!result.ok) {
      const msgs: Record<string, [string, number]> = {
        'auth.invalid_current_password': ["Joriy parol noto'g'ri", 400],
        'auth.same_password': ['Yangi parol joriy parolga teng', 400],
        'auth.user_not_found': ['Foydalanuvchi topilmadi', 404],
      };
      const [msg, status] = msgs[result.code] ?? ['Change password failed', 400];
      return c.json(fail(result.code, msg), status as 400 | 404);
    }
    return c.json(ok({ changed: true }));
  });

  return app;
};
