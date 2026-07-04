import { fail } from '@dental/core';
import type { MiddlewareHandler } from 'hono';
import { type AccessClaims, verifyAccess } from '../lib/jwt.ts';

declare module 'hono' {
  interface ContextVariableMap {
    accessClaims?: AccessClaims;
  }
}

/**
 * JWT auth middleware — Bearer token parse, claims c.set qiladi.
 *
 * - `Authorization: Bearer <token>` header'dan o'qiydi
 * - Token invalid/expired → 401
 * - Token valid → `c.set('user', { id: sub })`, `c.set('activeTenantId', atid)`, etc.
 *
 * ⚠️ Bu middleware faqat token VALIDLIGINI tekshiradi.
 * RLS context (`SET LOCAL`) — alohida `rlsMiddleware` orqali.
 * Permission check — `requirePermission(code)` orqali.
 */
export const authMiddleware = (): MiddlewareHandler => async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json(fail('auth.missing_token', 'Authorization header required'), 401);
  }

  const token = header.slice(7).trim();
  if (!token) {
    return c.json(fail('auth.missing_token', 'Bearer token empty'), 401);
  }

  let claims: AccessClaims;
  try {
    claims = await verifyAccess(token);
  } catch {
    return c.json(fail('auth.invalid_token', 'Token invalid or expired'), 401);
  }

  c.set('accessClaims', claims);
  c.set('user', { id: claims.sub });
  c.set('activeTenantId', claims.atid);
  c.set('activeBranchId', claims.abid);

  await next();
};
