/**
 * CLI-478 — SMS OTP parol-reset endpointlari olib tashlangan (guard test).
 *
 * `POST /api/auth/password-reset-request` va `POST /api/auth/password-reset`
 * endi mavjud emas (404). Owner reset — Supervisor vendor-token (CLI-226,
 * `/api/reset-owner-password`); xodim reset — owner admin-reset
 * (UsersSettingsScreen). SMS OTP self-service oqimi ortiqcha edi.
 *
 * ⚠️ Bearer token bilan so'raladi: `expenses`/`clinical`/`patient-images` bare
 * `/api` prefiksda `app.use('*', authMiddleware())` mount qiladi (app.ts CLI-358
 * izohi) — bu Hono merge quirk'i tokensiz so'rovlarda HAR QANDAY topilmagan
 * `/api/*` yo'lni ham (pre-existing, shu PR'dan mustaqil) 401 `auth.missing_token`
 * bilan ushlaydi, haqiqiy Hono 404'ga yetmasdan. Token bilan bu bleed'dan o'tib,
 * route haqiqatan mavjud emasligini (aniq 404) tasdiqlaymiz.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-478-reset-removed`
 */
import { describe, expect, it } from 'bun:test';
import { createApp } from '../../src/app.ts';
import { signAccess } from '../../src/lib/jwt.ts';

const app = createApp();

const authHeader = async () => {
  const { token } = await signAccess({
    sub: '00000000-0000-0000-0000-000000000000',
    atid: null,
    abid: null,
    perms: [],
    roleKey: null,
    lang: 'uz',
  });
  return { authorization: `Bearer ${token}` };
};

describe('CLI-478 — SMS OTP reset endpointlari olib tashlangan', () => {
  it('POST /api/auth/password-reset-request 404 qaytaradi', async () => {
    const res = await app.request('/api/auth/password-reset-request', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ phone: '+998901234567' }),
    });
    expect(res.status).toBe(404);
  });

  it('POST /api/auth/password-reset 404 qaytaradi', async () => {
    const res = await app.request('/api/auth/password-reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        phone: '+998901234567',
        token: '123456',
        newPassword: 'x'.repeat(12),
      }),
    });
    expect(res.status).toBe(404);
  });
});
