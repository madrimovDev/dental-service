import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import { createAuditLogger } from '../../lib/audit-logger.ts';
import { env } from '../../lib/env.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { rateLimit } from '../../lib/rate-limit.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import {
  toLoginDto,
  toMembershipsDto,
  toRegisterTenantDto,
  toTokenPairDto,
} from './auth.mapper.ts';
import {
  changePasswordResponseSchema,
  changePasswordSchema,
  loginResponseSchema,
  loginSchema,
  logoutResponseSchema,
  logoutSchema,
  membershipsResponseSchema,
  passwordResetRequestResponseSchema,
  passwordResetRequestSchema,
  passwordResetResponseSchema,
  passwordResetSchema,
  refreshSchema,
  registerTenantResponseSchema,
  registerTenantSchema,
  switchWorkspaceSchema,
  tokenPairResponseSchema,
  workspaceBranchesResponseSchema,
} from './auth.schema.ts';
import { createAuthService } from './auth.service.ts';

/** Error response entry yasash helper'i (per-status declare uchun). */
const errResp = (description: string) => ({
  content: { 'application/json': { schema: errorResponseSchema } },
  description,
});

export const authRoutes = (deps: { db: Database }) => {
  // ⚠️ Auth modul app-level rlsMiddleware ISHLATMAYDI. Public route'lar auth'siz;
  // himoyalangan route'lar (/me, /switch-workspace, /change-password) PER-ROUTE
  // authMiddleware() bilan.
  // ⚠️ app.ts faqat `{ db }` uzatadi (uni o'zgartira olmaymiz) — qolgan deps (sms,
  // audit) shu yerda env'dan quriladi (reminder-worker precedenti).
  const app = new OpenAPIHono();
  const service = createAuthService(deps);
  const audit = createAuditLogger({ db: deps.db });

  // ─── Rate limiting (CLI-227) — Redis fixed-window, IP+telefon ────────────────
  const window = env.AUTH_RATE_LIMIT_WINDOW_SEC;
  const phoneKey = (b: unknown): string | undefined =>
    typeof b === 'object' && b !== null && typeof (b as { phone?: unknown }).phone === 'string'
      ? (b as { phone: string }).phone
      : undefined;

  const loginRateLimit = rateLimit({
    name: 'login',
    limit: env.AUTH_LOGIN_RATE_LIMIT,
    windowSeconds: window,
    keyFromBody: phoneKey,
  });
  const refreshRateLimit = rateLimit({
    name: 'refresh',
    limit: env.AUTH_REFRESH_RATE_LIMIT,
    windowSeconds: window,
    // refresh body'da telefon yo'q → faqat IP bo'yicha.
  });
  const resetRequestRateLimit = rateLimit({
    name: 'reset-request',
    limit: env.AUTH_RESET_RATE_LIMIT,
    windowSeconds: window,
    keyFromBody: phoneKey,
  });
  const resetRateLimit = rateLimit({
    name: 'reset',
    limit: env.AUTH_RESET_RATE_LIMIT,
    windowSeconds: window,
    keyFromBody: phoneKey,
  });

  // ─── POST /register-tenant — public ──────────────────────────────────────

  const registerTenantRoute = createRoute({
    method: 'post',
    path: '/register-tenant',
    tags: ['auth'],
    operationId: 'registerTenant',
    request: {
      body: { content: { 'application/json': { schema: registerTenantSchema } } },
    },
    responses: {
      201: {
        content: {
          'application/json': { schema: apiResponseSchema(registerTenantResponseSchema) },
        },
        description: 'Tenant registered',
      },
      400: errResp('Validation error'),
      409: errResp('Phone already registered'),
    },
  });

  app.openapi(registerTenantRoute, async (c) => {
    const body = c.req.valid('json');
    try {
      const result = await service.registerTenant(body);
      return c.json(ok(toRegisterTenantDto(result)), 201);
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

  // ─── POST /login — public ────────────────────────────────────────────────

  const loginRoute = createRoute({
    method: 'post',
    path: '/login',
    tags: ['auth'],
    operationId: 'login',
    middleware: [loginRateLimit] as const,
    request: {
      body: { content: { 'application/json': { schema: loginSchema } } },
    },
    responses: {
      ...okJson(loginResponseSchema, 'Login successful'),
      429: errResp('Too many requests'),
    },
  });

  app.openapi(loginRoute, async (c) => {
    const body = c.req.valid('json');
    const result = await service.login(body);

    // CLI-227: login audit — muvaffaqiyat va MUVAFFAQIYATSIZLIK ham (kim, qachon, ip, ua).
    // Platform-level event → tenantIdOverride: null. Failed login KO'RINADIGAN bo'lishi shart.
    if (!result.ok) {
      if (result.userId) c.set('user', { id: result.userId });
      await audit.record(c, {
        action: 'login.failed',
        resourceType: 'auth',
        resourceId: result.userId ?? null,
        after: { phone: body.phone, reason: result.reason },
        tenantIdOverride: null,
      });
      return c.json(fail('auth.invalid_credentials', "Email/telefon yoki parol noto'g'ri"), 401);
    }

    c.set('user', { id: result.userId });
    await audit.record(c, {
      action: 'login.success',
      resourceType: 'auth',
      resourceId: result.userId,
      tenantIdOverride: null,
    });
    return c.json(ok(toLoginDto(result)), 200);
  });

  // ─── POST /refresh — public (token bo'lsa) ───────────────────────────────

  const refreshRoute = createRoute({
    method: 'post',
    path: '/refresh',
    tags: ['auth'],
    operationId: 'refresh',
    middleware: [refreshRateLimit] as const,
    request: {
      body: { content: { 'application/json': { schema: refreshSchema } } },
    },
    responses: {
      ...okJson(tokenPairResponseSchema, 'Token refreshed'),
      429: errResp('Too many requests'),
    },
  });

  app.openapi(refreshRoute, async (c) => {
    const body = c.req.valid('json');
    const result = await service.refresh(body);
    if (!result) {
      return c.json(
        fail('auth.invalid_refresh', "Refresh token noto'g'ri yoki muddati tugagan"),
        401,
      );
    }
    return c.json(ok(toTokenPairDto(result)), 200);
  });

  // ─── POST /logout — public (refresh token bilan) ─────────────────────────

  const logoutRoute = createRoute({
    method: 'post',
    path: '/logout',
    tags: ['auth'],
    operationId: 'logout',
    request: {
      body: { content: { 'application/json': { schema: logoutSchema } } },
    },
    responses: okJson(logoutResponseSchema, 'Logged out'),
  });

  app.openapi(logoutRoute, async (c) => {
    // ⚠️ Tolerant: refreshToken yo'q bo'lsa ham 200 (hand `endpoints.ts` xulqi).
    const body = c.req.valid('json');
    if (body.refreshToken) {
      await service.logout(body.refreshToken);
    }
    return c.json(ok({ loggedOut: true as const }), 200);
  });

  // ─── GET /me — auth required ─────────────────────────────────────────────

  const meRoute = createRoute({
    method: 'get',
    path: '/me',
    tags: ['auth'],
    operationId: 'getMe',
    middleware: [authMiddleware()] as const,
    responses: okJson(membershipsResponseSchema, 'Current user memberships'),
  });

  app.openapi(meRoute, async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json(fail('auth.required', 'Authentication required'), 401);
    }
    const memberships = await service.getMemberships(user.id);
    return c.json(ok(toMembershipsDto(user.id, memberships)), 200);
  });

  // ─── GET /workspace-branches — auth required, RBAC-safe (no permission) ───
  // Topbar filial dropdown manbasi. CLI-154/155 precedenti: rolga tegishli data
  // tor auth-only endpoint orqali (requirePermission SIZ) — cross-domen 403 gap'siz.
  const workspaceBranchesRoute = createRoute({
    method: 'get',
    path: '/workspace-branches',
    tags: ['auth'],
    operationId: 'getWorkspaceBranches',
    middleware: [authMiddleware()] as const,
    responses: okJson(workspaceBranchesResponseSchema, 'Switchable branches in active tenant'),
  });

  app.openapi(workspaceBranchesRoute, async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json(fail('auth.required', 'Authentication required'), 401);
    }
    const tenantId = c.get('activeTenantId');
    if (!tenantId) {
      return c.json(ok({ branches: [], allowAllBranches: false }), 200);
    }
    const result = await service.workspaceBranches(user.id, tenantId);
    return c.json(ok(result), 200);
  });

  // ─── POST /switch-workspace — auth required (no workspace yet OK) ─────────

  const switchWorkspaceRoute = createRoute({
    method: 'post',
    path: '/switch-workspace',
    tags: ['auth'],
    operationId: 'switchWorkspace',
    middleware: [authMiddleware()] as const,
    request: {
      body: { content: { 'application/json': { schema: switchWorkspaceSchema } } },
    },
    responses: {
      ...okJson(tokenPairResponseSchema, 'Workspace switched'),
      404: errResp('User not found'),
    },
  });

  app.openapi(switchWorkspaceRoute, async (c) => {
    const user = c.get('user');
    if (!user) {
      return c.json(fail('auth.required', 'Authentication required'), 401);
    }
    const body = c.req.valid('json');
    const result = await service.switchWorkspace(user.id, body);
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
    return c.json(ok(toTokenPairDto(result)), 200);
  });

  // ─── POST /password-reset-request — public, mock OTP ─────────────────────

  const passwordResetRequestRoute = createRoute({
    method: 'post',
    path: '/password-reset-request',
    tags: ['auth'],
    operationId: 'passwordResetRequest',
    middleware: [resetRequestRateLimit] as const,
    request: {
      body: { content: { 'application/json': { schema: passwordResetRequestSchema } } },
    },
    responses: {
      ...okJson(passwordResetRequestResponseSchema, 'Reset code sent (if user exists)'),
      429: errResp('Too many requests'),
    },
  });

  app.openapi(passwordResetRequestRoute, async (c) => {
    const body = c.req.valid('json');
    await service.requestPasswordReset(body);
    return c.json(ok({ sent: true as const }), 200);
  });

  // ─── POST /password-reset — public ───────────────────────────────────────

  const passwordResetRoute = createRoute({
    method: 'post',
    path: '/password-reset',
    tags: ['auth'],
    operationId: 'passwordReset',
    middleware: [resetRateLimit] as const,
    request: {
      body: { content: { 'application/json': { schema: passwordResetSchema } } },
    },
    responses: {
      ...okJson(passwordResetResponseSchema, 'Password reset'),
      429: errResp('Too many requests'),
    },
  });

  app.openapi(passwordResetRoute, async (c) => {
    const body = c.req.valid('json');
    const result = await service.resetPassword(body);
    if (!result) {
      return c.json(fail('auth.invalid_reset_token', "Token noto'g'ri yoki muddati tugagan"), 400);
    }
    return c.json(ok({ ok: true as const }), 200);
  });

  // ─── POST /change-password — authenticated, joriy parol bilan ────────────

  const changePasswordRoute = createRoute({
    method: 'post',
    path: '/change-password',
    tags: ['auth'],
    operationId: 'changePassword',
    middleware: [authMiddleware()] as const,
    request: {
      body: { content: { 'application/json': { schema: changePasswordSchema } } },
    },
    responses: {
      ...okJson(changePasswordResponseSchema, 'Password changed'),
      404: errResp('User not found'),
    },
  });

  app.openapi(changePasswordRoute, async (c) => {
    const user = c.get('user');
    if (!user) return c.json(fail('auth.required', 'Authentication required'), 401);

    const body = c.req.valid('json');
    const result = await service.changePassword(user.id, body);
    if (!result.ok) {
      const msgs: Record<string, [string, number]> = {
        'auth.invalid_current_password': ["Joriy parol noto'g'ri", 400],
        'auth.same_password': ['Yangi parol joriy parolga teng', 400],
        'auth.user_not_found': ['Foydalanuvchi topilmadi', 404],
      };
      const [msg, status] = msgs[result.code] ?? ['Change password failed', 400];
      return c.json(fail(result.code, msg), status as 400 | 404);
    }
    return c.json(ok({ changed: true as const }), 200);
  });

  return app;
};
