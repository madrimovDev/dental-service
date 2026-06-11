import { randomUUID } from 'node:crypto';
import { sign, verify } from 'hono/jwt';
import { env } from './env.ts';

/**
 * JWT — HS256, 15 daq access + 7 kun refresh, rotation ON.
 *
 * Access claims: user + active workspace context + permissions[].
 *   - `atid`/`abid` null bo'lishi mumkin (login dan keyin lekin workspace tanlangunicha)
 *   - `perms[]` joriy (tenant, branch) kontekstdagi ruxsatlar
 *
 * Refresh claims: faqat user + jti (revocation tracking uchun).
 *
 * ⚠️ Staleness: access token 15 daq ichida cache'lanadi. Permission o'zgarishi
 * 15 daq kechiktirilgan bo'lishi mumkin. Real-time revocation kerak bo'lsa
 * Redis denylist (M4+).
 */

export type AccessClaims = {
  sub: string;
  atid: string | null;
  abid: string | null;
  perms: string[];
  roleKey: string | null; // aktiv kontekstdagi birlamchi rol templateKey'i (owner / no-context → null)
  lang: 'uz' | 'ru';
  iat: number;
  exp: number;
  jti: string;
};

export type RefreshClaims = {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
};

const ACCESS_TTL_SECONDS = parseDuration(env.JWT_ACCESS_EXPIRES); // '15m' default
const REFRESH_TTL_SECONDS = parseDuration(env.JWT_REFRESH_EXPIRES); // '7d' default

function parseDuration(value: string): number {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration: ${value}`);
  const num = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's':
      return num;
    case 'm':
      return num * 60;
    case 'h':
      return num * 60 * 60;
    case 'd':
      return num * 60 * 60 * 24;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

export const signAccess = async (
  payload: Omit<AccessClaims, 'iat' | 'exp' | 'jti'>,
): Promise<{ token: string; jti: string; expiresAt: Date }> => {
  const now = Math.floor(Date.now() / 1000);
  const jti = randomUUID();
  const exp = now + ACCESS_TTL_SECONDS;
  const claims: AccessClaims = { ...payload, iat: now, exp, jti };
  const token = await sign(claims, env.JWT_SECRET, 'HS256');
  return { token, jti, expiresAt: new Date(exp * 1000) };
};

export const signRefresh = async (
  userId: string,
): Promise<{ token: string; jti: string; expiresAt: Date }> => {
  const now = Math.floor(Date.now() / 1000);
  const jti = randomUUID();
  const exp = now + REFRESH_TTL_SECONDS;
  const claims: RefreshClaims = { sub: userId, iat: now, exp, jti };
  const token = await sign(claims, env.JWT_SECRET, 'HS256');
  return { token, jti, expiresAt: new Date(exp * 1000) };
};

export const verifyAccess = async (token: string): Promise<AccessClaims> => {
  const payload = (await verify(token, env.JWT_SECRET, 'HS256')) as AccessClaims;
  return payload;
};

export const verifyRefresh = async (token: string): Promise<RefreshClaims> => {
  const payload = (await verify(token, env.JWT_SECRET, 'HS256')) as RefreshClaims;
  return payload;
};
