import { fail, hasFeature, type Vertical, type VerticalFeature } from '@dental/core';
import { tenantSettings } from '@dental/db-schema';
import type { MiddlewareHandler } from 'hono';
import { getDb } from '../db/scoped.ts';

/**
 * Joriy tenant verticali mazkur feature'ni yoqmasa 403 qaytaradi.
 *
 * UI yashirsa-da API ham yopiq bo'lishi uchun (defense-in-depth, CLI-153 saboq:
 * "UI hides it but API still serves it" gap'ni yopadi).
 *
 * Tartibi (auth → RLS → requirePermission'dan KEYIN ishlaydi):
 *   1. RLS-bound `db`'dan tenant_settings o'qiladi (tenant_id explicit YOZILMAYDI — RLS filtrlaydi)
 *   2. vertical aniqlanadi (row yo'q → 'dental' default)
 *   3. feature yoqilmagan bo'lsa 403 feature.disabled
 */
export const requireFeature =
  (feature: VerticalFeature): MiddlewareHandler =>
  async (c, next) => {
    const db = getDb(c);
    const [settings] = await db
      .select({ vertical: tenantSettings.vertical })
      .from(tenantSettings)
      .limit(1);
    const vertical = (settings?.vertical ?? 'dental') as Vertical;
    if (!hasFeature(vertical, feature)) {
      return c.json(
        fail('feature.disabled', `Feature not available for vertical: ${feature}`),
        403,
      );
    }
    await next();
  };
