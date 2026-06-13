/**
 * CLI-153 permission guard — REAL Receptionist rol shabloni permset'i bilan (NOT @owner).
 *
 * Avvalgi E2E faqat Owner (`@owner` wildcard) bilan sinangani uchun cross-domen 403
 * yashiringan edi. Bu test aynan shuni qoplaydi: haqiqiy `requirePermission` middleware'ni
 * haqiqiy Receptionist permset bilan o'tkazadi (`@owner` YO'Q).
 *
 *  - Yangi yengil guardlar (`appointment.view`, `cashier.view`) → 200 (CLI-154/155 fix).
 *  - Eski guardlar (`user.view`, `medical_record.view`) → 403 (regression sababi —
 *    nega ekran 403 olardi, hujjatlashtiradi).
 *
 * DB talab qilmaydi (sof middleware testi).
 */

import { describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { Hono } from 'hono';
import { requirePermission } from '../../src/middleware/require-permission.ts';

const receptionist = ROLE_TEMPLATES.find((t) => t.templateKey === 'receptionist');
if (!receptionist) throw new Error('receptionist template not found');
const receptionistPerms = [...receptionist.permissions] as string[];

/** Receptionist claims (NOT @owner) o'rnatadigan mock auth + bitta guard'li route. */
const guardApp = (permCode: Parameters<typeof requirePermission>[0]) => {
  const app = new Hono<{ Variables: { accessClaims: { perms: string[] } } }>();
  app.use('*', (c, next) => {
    c.set('accessClaims', { perms: receptionistPerms });
    return next();
  });
  app.get('/x', requirePermission(permCode), (c) => c.json({ ok: true }));
  return app;
};

describe('CLI-153 — Receptionist permset (NOT owner) guard natijasi', () => {
  test('sanity: Receptionist permset @owner sentinelga ega EMAS', () => {
    expect(receptionistPerms).not.toContain('@owner');
    expect(receptionistPerms).toContain('appointment.view');
    expect(receptionistPerms).toContain('cashier.view');
  });

  test("CLI-154 yangi guard: appointment.view → 200 (doktorlar ro'yxati)", async () => {
    const res = await guardApp('appointment.view').request('/x');
    expect(res.status).toBe(200);
  });

  test('CLI-155 yangi guard: cashier.view → 200 (plan-billing)', async () => {
    const res = await guardApp('cashier.view').request('/x');
    expect(res.status).toBe(200);
  });

  test('eski guard: user.view → 403 (CLI-154 bug sababi)', async () => {
    const res = await guardApp('user.view').request('/x');
    expect(res.status).toBe(403);
  });

  test('eski guard: medical_record.view → 403 (CLI-155 bug sababi)', async () => {
    const res = await guardApp('medical_record.view').request('/x');
    expect(res.status).toBe(403);
  });
});
