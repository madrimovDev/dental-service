import { tenantSettings } from '@dental/db-schema';
import type { Context } from 'hono';
import { withTenant } from '../db/scoped.ts';
import { verifyAccess } from './jwt.ts';
import { computeExpiryState, type LicenseState, MAX_GRACE_DAYS } from './license.ts';
import { logger } from './logger.ts';

/**
 * L8 — SaaS obunasi (P18 bilan BIR XIL qoidalar). Desktop `.lic` o'rniga
 * `tenant_settings.subscription_expires_at` (Supervisor'dan sinxronlanadi);
 * muddat + `MAX_GRACE_DAYS` imtiyoz, keyin to'liq blok. Holat hisobi
 * `computeExpiryState` — desktop bilan umumiy.
 *
 * Muddat NOMA'LUM (NULL: Supervisor hali ro'yxatga olmagan / o'chiq) → `none` —
 * hech qachon bloklamaydi va banner chiqarmaydi (Supervisor o'chiq bo'lsa
 * klinika ishlashda davom etishi shart).
 */
export const computeSubscriptionState = (
  expiresAt: Date | string | null | undefined,
  nowMs: number = Date.now(),
): LicenseState => {
  if (!expiresAt) return { state: 'none', expiresAt: null, graceEndsAt: null, daysLeft: null };
  const iso = expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt;
  return computeExpiryState(iso, MAX_GRACE_DAYS, nowMs);
};

// ─── Tenant obunasi o'qish (30 s kesh) ───────────────────────────────────────
// Har /api so'rovida DB tx ochmaslik uchun. Kesh muddati qisqa: sinxron/renew
// natijasi eng ko'pi bilan shuncha kechikadi; sinxron o'zi `invalidate` qiladi.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { expiresAt: string | null; until: number }>();

export const invalidateSubscriptionCache = (tenantId?: string): void => {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
};

/** Tenantning saqlangan obuna muddati (ISO) yoki NULL. DB xatosi → NULL (fail-open, log). */
export const getTenantSubscriptionExpiry = async (
  tenantId: string,
  nowMs: number = Date.now(),
): Promise<string | null> => {
  const hit = cache.get(tenantId);
  if (hit && hit.until > nowMs) return hit.expiresAt;
  try {
    const expiresAt = await withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({ at: tenantSettings.subscriptionExpiresAt })
        .from(tenantSettings);
      return row?.at ? row.at.toISOString() : null;
    });
    cache.set(tenantId, { expiresAt, until: nowMs + CACHE_TTL_MS });
    return expiresAt;
  } catch (err) {
    logger.warn({ err, tenantId }, 'subscription lookup failed — fail-open');
    return null;
  }
};

/**
 * `Authorization: Bearer` dan tenant UUID (best-effort). Token yo'q/yaroqsiz →
 * `null` — chaqiruvchi so'rovni o'tkazib yuboradi, 401'ni `authMiddleware` beradi.
 */
export const tenantIdFromBearer = async (c: Context): Promise<string | null> => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const claims = await verifyAccess(header.slice(7).trim());
    return claims.atid ?? null;
  } catch {
    return null;
  }
};

export const getTenantSubscriptionState = async (tenantId: string): Promise<LicenseState> =>
  computeSubscriptionState(await getTenantSubscriptionExpiry(tenantId));
