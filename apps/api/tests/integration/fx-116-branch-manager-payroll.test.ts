/**
 * FX-116 (LB-25) — Payroll butun klinika bo'yicha (tenant-wide); filial mudiri shabloni
 * `payroll.view`/`payroll.manage`ga ega bo'lmasligi kerak. Haqiqiy `requirePermission`
 * middleware'i HAQIQIY Branch Manager shablon permset'i bilan (NOT @owner). Owner-yo'l
 * (`@owner`) va Accountant (tenant-wide moliya roli) hamon o'tadi.
 *
 *   cd apps/api && bun test tests/integration/fx-116-branch-manager-payroll.test.ts --env-file=../../.env
 */

import { describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { Hono } from 'hono';
import { requirePermission } from '../../src/middleware/require-permission.ts';

const permsOf = (key: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === key);
  if (!t) throw new Error(`template not found: ${key}`);
  return [...t.permissions] as string[];
};

const guardApp = (perms: string[], permCode: Parameters<typeof requirePermission>[0]) => {
  const app = new Hono<{ Variables: { accessClaims: { perms: string[] } } }>();
  app.use('*', (c, next) => {
    c.set('accessClaims', { perms });
    return next();
  });
  app.all('/x', requirePermission(permCode), (c) => c.json({ ok: true }));
  return app;
};

describe('FX-116 — Branch Manager payroll ruxsatisiz', () => {
  const bm = permsOf('branch_manager');

  test('sanity: BM @owner emas, filial-darajali (expense.view) ruxsat bor', () => {
    expect(bm).not.toContain('@owner');
    expect(bm).toContain('expense.view');
  });

  test.each(['payroll.view', 'payroll.manage'] as const)('BM → %s guard 403', async (code) => {
    const res = await guardApp(bm, code).request('/x', { method: 'POST' });
    expect(res.status).toBe(403);
  });

  test.each([
    'payroll.view',
    'payroll.manage',
  ] as const)('Accountant → %s guard 200', async (code) => {
    const res = await guardApp(permsOf('accountant'), code).request('/x', { method: 'POST' });
    expect(res.status).toBe(200);
  });
});
