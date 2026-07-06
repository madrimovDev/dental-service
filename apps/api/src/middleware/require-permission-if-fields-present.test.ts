/**
 * CLI-446: `requirePermissionIfFieldsPresent` — moliyaviy maydon (masalan
 * `baseSalary`/`commissionPercent`) body'da bo'lsagina qo'shimcha permission talab
 * qilinishini tekshiradi (boshqa maydonlar uchun asosiy permission yetarli qoladi).
 *
 * DB talab qilmaydi (sof middleware testi, CLI-153 pattern: haqiqiy permset, @owner EMAS).
 */
import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { requirePermissionIfFieldsPresent } from './require-permission.ts';

/** `perms` bilan claims o'rnatuvchi mock auth + bitta gated route. */
const guardApp = (perms: string[]) => {
  const app = new Hono<{ Variables: { accessClaims: { perms: string[] } } }>();
  app.use('*', (c, next) => {
    c.set('accessClaims', { perms });
    return next();
  });
  app.put(
    '/x',
    requirePermissionIfFieldsPresent(['baseSalary', 'commissionPercent'], 'payroll.manage'),
    (c) => c.json({ ok: true }),
  );
  return app;
};

const postJson = (app: ReturnType<typeof guardApp>, body: unknown) =>
  app.request('/x', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('CLI-446 — requirePermissionIfFieldsPresent (payroll.manage gate)', () => {
  test("user.manage bor, payroll.manage YO'Q, body baseSalary bilan → 403", async () => {
    const res = await postJson(guardApp(['user.manage']), {
      specialty: 'Terapevt',
      baseSalary: 500000,
      commissionPercent: 10,
    });
    expect(res.status).toBe(403);
  });

  test("user.manage bor, payroll.manage YO'Q, body commissionPercent bilan → 403", async () => {
    const res = await postJson(guardApp(['user.manage']), {
      commissionPercent: 15,
    });
    expect(res.status).toBe(403);
  });

  test('user.manage + payroll.manage ikkalasi bor, salary maydonlari bilan → 200', async () => {
    const res = await postJson(guardApp(['user.manage', 'payroll.manage']), {
      baseSalary: 500000,
      commissionPercent: 10,
    });
    expect(res.status).toBe(200);
  });

  test("boshqa profil maydonlari (salary YO'Q) — payroll.manage'siz ham 200", async () => {
    const res = await postJson(guardApp(['user.manage']), {
      specialty: 'Terapevt',
      employmentStatus: 'active',
    });
    expect(res.status).toBe(200);
  });

  test("@owner sentinel — payroll.manage yo'q bo'lsa ham salary maydonlari bilan 200", async () => {
    const res = await postJson(guardApp(['@owner']), {
      baseSalary: 750000,
      commissionPercent: 20,
    });
    expect(res.status).toBe(200);
  });
});
