/**
 * CLI-470 permission guard — REAL Accountant rol shabloni permset'i bilan (NOT @owner).
 *
 * Payroll ekranida xodim ismini yechish uchun `useUserAssignments()` → `GET
 * /users/assignments` (`user.view`) chaqirilardi — Accountant template'da
 * `payroll.view`/`payroll.manage` bor, `user.view` YO'Q → cross-domen 403 (CLI-153/154/155
 * bilan bir xil takrorlanuvchi pattern). Bu test aynan shuni qoplaydi: haqiqiy
 * `requirePermission` middleware'ni haqiqiy Accountant permset bilan o'tkazadi.
 *
 *  - Yangi yengil guard (`payroll.view`) → 200 (yangi `GET /payroll/staff-names`).
 *  - Eski guard (`user.view`) → 403 (regression sababi — nega ekran 403 olardi,
 *    hujjatlashtiradi).
 *
 * DB talab qilmaydi (sof middleware testi).
 */

import { describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { Hono } from 'hono';
import { requirePermission } from '../../src/middleware/require-permission.ts';

const accountant = ROLE_TEMPLATES.find((t) => t.templateKey === 'accountant');
if (!accountant) throw new Error('accountant template not found');
const accountantPerms = [...accountant.permissions] as string[];

/** Accountant claims (NOT @owner) o'rnatadigan mock auth + bitta guard'li route. */
const guardApp = (permCode: Parameters<typeof requirePermission>[0]) => {
  const app = new Hono<{ Variables: { accessClaims: { perms: string[] } } }>();
  app.use('*', (c, next) => {
    c.set('accessClaims', { perms: accountantPerms });
    return next();
  });
  app.get('/x', requirePermission(permCode), (c) => c.json({ ok: true }));
  return app;
};

describe('CLI-470 — Accountant permset (NOT owner) guard natijasi', () => {
  test('sanity: Accountant permset @owner sentinelga ega EMAS', () => {
    expect(accountantPerms).not.toContain('@owner');
    expect(accountantPerms).toContain('payroll.view');
    expect(accountantPerms).not.toContain('user.view');
  });

  test("yangi guard: payroll.view → 200 (xodim ismlari ro'yxati)", async () => {
    const res = await guardApp('payroll.view').request('/x');
    expect(res.status).toBe(200);
  });

  test('eski guard: user.view → 403 (CLI-470 bug sababi)', async () => {
    const res = await guardApp('user.view').request('/x');
    expect(res.status).toBe(403);
  });
});
