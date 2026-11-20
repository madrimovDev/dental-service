import { ApiError } from '@dental/api-client';
import { i18n } from '@/lib/i18n.ts';

/**
 * API xato kodi → foydalanuvchi tilidagi matn. `apiErrors.<code>` kaliti bo'lsa (kod nuqtalari
 * ichma-ich kalit bo'ladi: `ownership.not_practitioner` → `apiErrors.ownership.not_practitioner`)
 * — tarjima; aks holda server xabari; u ham bo'lmasa — `common.error`.
 * FX-155 review: avval toast xom inglizcha server matnini ko'rsatardi.
 */
export function apiErrorMessage(error: unknown): string {
  const fallback = i18n.t('common.error');
  if (error instanceof ApiError) {
    const key = `apiErrors.${error.code}`;
    if (error.code && typeof i18n.exists === 'function' && i18n.exists(key)) {
      // FT-04: `details` (masalan `{ maxPercent }`) — interpolatsiya parametrlari.
      const params =
        error.details && typeof error.details === 'object'
          ? (error.details as Record<string, unknown>)
          : undefined;
      return i18n.t(key, params);
    }
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message || fallback;
  return fallback;
}
