/**
 * CLI-226 — Password-reset ATO (account takeover) fix (REAL DB).
 *
 * Isbotlaydi:
 *  1. Kod FOYDALANUVCHIGA bog'langan — A foydalanuvchi kodi B foydalanuvchi telefoni
 *     bilan reset qila OLMAYDI (token userId bo'yicha topiladi, global hash EMAS).
 *  2. Brute-force BLOKLANGAN — N noto'g'ri urinishdan keyin token bekor bo'ladi:
 *     (N+1)-urinish TO'G'RI kod bilan ham rad etiladi.
 *  3. Reset kodi NotificationChannel orqali yuboriladi (capturing kanal in'ektsiya).
 *  4. To'g'ri kod (limit ichida) parolni reset qiladi + barcha refresh tokenlarni revoke.
 *
 * Ushbu test SERVICE mantiqini ROL-EMAS, balki XAVFSIZLIK-INVARIANTLARI bo'yicha
 * tekshiradi. password_reset_tokens — platform-level (RLS YO'Q), shuning uchun oddiy
 * `db` bilan o'qiladi.
 *
 * Talab: Postgres running, migration 0018 apply qilingan.
 * Ishga tushirish: `cd apps/api && bun test --env-file=<repo>/.env cli-226`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { passwordResetTokens, refreshTokens, users } from '@dental/db-schema';
import type { NotificationChannel } from '@dental/notifications';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { hashPassword, verifyPassword } from '../../src/lib/password.ts';
import { createAuthService } from '../../src/modules/auth/auth.service.ts';

// Capturing SMS kanal — yuborilgan kodlarni ushlaydi (to'g'ri kodni testda olish uchun).
const sent: { to: string; text: string }[] = [];
const captureChannel: NotificationChannel = {
  async send(to, message) {
    sent.push({ to, text: message.text });
    return { ok: true };
  },
};

const authService = createAuthService({ db, sms: captureChannel });

const PHONE_A = '+998900002261';
const PHONE_B = '+998900002262';
let userAId: string;
let userBId: string;

/** Yuborilgan oxirgi SMS matnidan 6-xonali kodni ajratib olish. */
const lastCode = (phone: string): string => {
  const msg = [...sent].reverse().find((s) => s.to === phone);
  if (!msg) throw new Error(`No SMS sent to ${phone}`);
  const m = msg.text.match(/(\d{6})/);
  if (!m?.[1]) throw new Error(`No code in SMS: ${msg.text}`);
  return m[1];
};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  sent.length = 0;
  const inserted = await db
    .insert(users)
    .values([
      { phone: PHONE_A, passwordHash: await hashPassword('OldPasswordAAA1'), fullName: 'User A' },
      { phone: PHONE_B, passwordHash: await hashPassword('OldPasswordBBB1'), fullName: 'User B' },
    ])
    .returning({ id: users.id });
  const [a, b] = inserted;
  if (!a || !b) throw new Error('user insert failed');
  userAId = a.id;
  userBId = b.id;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-226 — password-reset ATO fix', () => {
  test('reset kodi NotificationChannel orqali yuboriladi', async () => {
    sent.length = 0;
    await authService.requestPasswordReset({ phone: PHONE_A });
    expect(sent.length).toBe(1);
    expect(sent[0]?.to).toBe(PHONE_A);
    expect(sent[0]?.text).toMatch(/\d{6}/);
  });

  test("A foydalanuvchi kodi B'ni reset qila OLMAYDI (userId binding)", async () => {
    sent.length = 0;
    await authService.requestPasswordReset({ phone: PHONE_A });
    const codeA = lastCode(PHONE_A);

    // A'ning to'g'ri kodi, lekin B'ning telefoni → rad etilishi shart.
    const res = await authService.resetPassword({
      phone: PHONE_B,
      token: codeA,
      newPassword: 'HackerNewPass123',
    });
    expect(res).toBeNull();

    // B paroli o'zgarmagan bo'lishi kerak.
    const [b] = await db.select().from(users).where(eq(users.id, userBId));
    expect(await verifyPassword('OldPasswordBBB1', b?.passwordHash ?? '')).toBe(true);
  });

  test('brute-force BLOKLANGAN — 5 noto‘g‘ri urinishdan keyin to‘g‘ri kod ham rad etiladi', async () => {
    sent.length = 0;
    await authService.requestPasswordReset({ phone: PHONE_A });
    const correct = lastCode(PHONE_A);

    // 5 ta noto'g'ri kod (correct'dan farqli) — har biri null qaytaradi.
    for (let i = 0; i < 5; i++) {
      const wrong = String((Number(correct) + i + 1) % 1000000).padStart(6, '0');
      const r = await authService.resetPassword({
        phone: PHONE_A,
        token: wrong,
        newPassword: 'ShouldNotApply1',
      });
      expect(r).toBeNull();
    }

    // attempts limit oshdi → token bekor (usedAt). Endi TO'G'RI kod ham ishlamaydi.
    const r = await authService.resetPassword({
      phone: PHONE_A,
      token: correct,
      newPassword: 'ShouldNotApply1',
    });
    expect(r).toBeNull();

    // A paroli o'zgarmagan.
    const [a] = await db.select().from(users).where(eq(users.id, userAId));
    expect(await verifyPassword('OldPasswordAAA1', a?.passwordHash ?? '')).toBe(true);

    // Token usedAt o'rnatilgan (bekor).
    const tokens = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userAId));
    const active = tokens.filter((t) => t.usedAt === null);
    expect(active.length).toBe(0);
  });

  test('to‘g‘ri kod (limit ichida) parolni reset qiladi + refresh tokenlarni revoke qiladi', async () => {
    // Eski refresh token qo'shamiz — reset uni revoke qilishi kerak.
    await db.insert(refreshTokens).values({
      userId: userAId,
      tokenHash: 'cli226-old-refresh-hash',
      expiresAt: new Date(Date.now() + 86400000),
    });

    sent.length = 0;
    await authService.requestPasswordReset({ phone: PHONE_A });
    const correct = lastCode(PHONE_A);

    const res = await authService.resetPassword({
      phone: PHONE_A,
      token: correct,
      newPassword: 'BrandNewPass4567',
    });
    expect(res).toEqual({ ok: true });

    const [a] = await db.select().from(users).where(eq(users.id, userAId));
    expect(await verifyPassword('BrandNewPass4567', a?.passwordHash ?? '')).toBe(true);

    // Barcha refresh token revoke.
    const liveRefresh = await db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, userAId), isNull(refreshTokens.revokedAt)));
    expect(liveRefresh.length).toBe(0);
  });

  test('yangi reset so‘rovi eski ishlatilmagan tokenni bekor qiladi (bitta aktiv token)', async () => {
    sent.length = 0;
    await authService.requestPasswordReset({ phone: PHONE_A });
    await authService.requestPasswordReset({ phone: PHONE_A });
    const tokens = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, userAId), isNull(passwordResetTokens.usedAt)));
    expect(tokens.length).toBe(1);
  });

  test('mavjud bo‘lmagan telefon uchun ham sent:true (enumeration oldini olish)', async () => {
    const res = await authService.requestPasswordReset({ phone: '+998900009999' });
    expect(res).toEqual({ sent: true });
  });
});
