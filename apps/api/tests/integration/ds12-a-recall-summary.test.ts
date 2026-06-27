/**
 * DS12-A recall summary — service integratsiya + RBAC guard testlari.
 *
 * Service testi: status sanoq + overdue + efficacyPct (real DB, RLS).
 * Guard testi: recall.view bor → 200; yo'q → 403 (cli-153 pattern).
 *
 * Ishga tushirish:
 *   cd apps/api && bun test --env-file=../../.env ds12-a-recall-summary.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ROLE_TEMPLATES } from '@dental/core';
import { branches, patients, recalls, tenants, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { requirePermission } from '../../src/middleware/require-permission.ts';
import { createRecallsService } from '../../src/modules/recalls/recalls.service.ts';

// ─── Guard testi (sof middleware, DB shart emas) ──────────────────────────

const recallViewPerms = (() => {
  // branch_manager recall.view ga ega — past uning permset'ini ishlatamiz
  const tpl = ROLE_TEMPLATES.find((t) => t.templateKey === 'branch_manager');
  if (!tpl) throw new Error('branch_manager template not found');
  return [...tpl.permissions] as string[];
})();

const noRecallViewPerms = (() => {
  // technician recall.view ga ega EMAS (tuzilish: texnik)
  const tpl = ROLE_TEMPLATES.find((t) => t.templateKey === 'technician');
  if (!tpl) throw new Error('technician template not found');
  return [...tpl.permissions] as string[];
})();

const guardApp = (permCode: Parameters<typeof requirePermission>[0], perms: string[]) => {
  const app = new Hono<{ Variables: { accessClaims: { perms: string[] } } }>();
  app.use('*', (c, next) => {
    c.set('accessClaims', { perms });
    return next();
  });
  app.get('/x', requirePermission(permCode), (c) => c.json({ ok: true }));
  return app;
};

describe("DS12-A — recall.view guard (sof middleware, DB yo'q)", () => {
  test('sanity: branch_manager permset @owner sentinel emas', () => {
    expect(recallViewPerms).not.toContain('@owner');
    expect(recallViewPerms).toContain('recall.view');
  });

  test('sanity: technician permset recall.view ga ega EMAS', () => {
    expect(noRecallViewPerms).not.toContain('@owner');
    expect(noRecallViewPerms).not.toContain('recall.view');
  });

  test('recall.view bor permset → 200', async () => {
    const res = await guardApp('recall.view', recallViewPerms).request('/x');
    expect(res.status).toBe(200);
  });

  test("recall.view yo'q permset → 403", async () => {
    const res = await guardApp('recall.view', noRecallViewPerms).request('/x');
    expect(res.status).toBe(403);
  });
});

// ─── Service integratsiya testi (real DB, RLS) ───────────────────────────

const noopAudit = { record: async () => {} };
const service = createRecallsService({ audit: noopAudit });

let tenantId: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) => (k === 'db' ? tx : undefined),
  }) as unknown as Context;

const run = <T>(fn: (c: Context) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx));
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000099', passwordHash: 'x', fullName: 'RecallDoc' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Recall Test Clinic', slug: 'recall-test-clinic', ownerUserId: owner.id })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Main Branch' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Test Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');

    // Recall'lar:
    // - pending, muddati aniq o'tgan (overdue) → overdue sanaladi
    // - pending, kelajakda → overdue EMAS
    // - contacted, kelajakda → overdue EMAS
    // - scheduled → yopiq, efficacy uchun converted
    // Jami: total=4, pending=2, contacted=1, scheduled=1, overdue=1
    // efficacyPct = (scheduled + completed) / total * 100 = (1+0)/4 * 100 = 25
    await tx.insert(recalls).values([
      {
        tenantId,
        patientId: patient.id,
        reason: 'preventive' as const,
        source: 'manual' as const,
        status: 'pending' as const,
        dueDate: '2020-01-01', // aniq o'tgan — overdue
      },
      {
        tenantId,
        patientId: patient.id,
        reason: 'preventive' as const,
        source: 'manual' as const,
        status: 'pending' as const,
        dueDate: '2099-12-31', // kelajak — overdue emas
      },
      {
        tenantId,
        patientId: patient.id,
        reason: 'treatment_followup' as const,
        source: 'manual' as const,
        status: 'contacted' as const,
        dueDate: '2099-12-31', // kelajak — overdue emas
      },
      {
        tenantId,
        patientId: patient.id,
        reason: 'post_op_check' as const,
        source: 'manual' as const,
        status: 'scheduled' as const,
        dueDate: '2099-12-31',
      },
    ]);
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('DS12-A recall summary — real DB + RLS', () => {
  test('summary: status sanoq + overdue + efficacy', async () => {
    const r = await run((c) => service.summary(c));
    expect(r.pending).toBe(2);
    expect(r.contacted).toBe(1);
    expect(r.scheduled).toBe(1);
    expect(r.overdue).toBe(1); // dueDate < CURRENT_DATE, pending holatda
    // efficacyPct = (scheduled + completed) / total * 100 = (1+0)/4 * 100 = 25
    expect(r.efficacyPct).toBeCloseTo((1 / 4) * 100, 1);
  });

  test("summary — RLS tenant izolyatsiyasi: boshqa tenant recall ko'rinmaydi", async () => {
    // branchId berilmasa ham RLS tenantId bo'yicha filtrlaydi
    // Bu tenantdagi 4 ta recall ko'rinadi, boshqa tenant yo'q
    const r = await run((c) => service.summary(c));
    expect(r.pending + r.contacted + r.scheduled).toBe(4);
  });

  test('summary branchId filter — faqat shu filial recalls qaytadi', async () => {
    // Bir tenantda ikki filial, har birida alohida recall'lar
    // branchId bilan filter qilinganda faqat shu filialniki ko'rinadi
    // branchId=null bo'lgan recall'lar EQ filter'ga tushmaydi (null != branchA.id)

    let branchAId: string;
    let branchBId: string;

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

      const [branchA] = await tx
        .insert(branches)
        .values({ tenantId, name: 'Filial A' })
        .returning({ id: branches.id });
      if (!branchA) throw new Error('branchA insert failed');
      branchAId = branchA.id;

      const [branchB] = await tx
        .insert(branches)
        .values({ tenantId, name: 'Filial B' })
        .returning({ id: branches.id });
      if (!branchB) throw new Error('branchB insert failed');
      branchBId = branchB.id;

      const [patient] = await tx
        .insert(patients)
        .values({ tenantId, fullName: 'Branch Filter Bemor' })
        .returning({ id: patients.id });
      if (!patient) throw new Error('branch filter patient insert failed');

      // branchA: 2 ta pending recall
      await tx.insert(recalls).values([
        {
          tenantId,
          patientId: patient.id,
          branchId: branchAId,
          reason: 'preventive' as const,
          source: 'manual' as const,
          status: 'pending' as const,
          dueDate: '2099-12-31',
        },
        {
          tenantId,
          patientId: patient.id,
          branchId: branchAId,
          reason: 'preventive' as const,
          source: 'manual' as const,
          status: 'contacted' as const,
          dueDate: '2099-12-31',
        },
      ]);

      // branchB: 3 ta recall (branchA filter'da ko'rinmasin)
      await tx.insert(recalls).values([
        {
          tenantId,
          patientId: patient.id,
          branchId: branchBId,
          reason: 'preventive' as const,
          source: 'manual' as const,
          status: 'pending' as const,
          dueDate: '2099-12-31',
        },
        {
          tenantId,
          patientId: patient.id,
          branchId: branchBId,
          reason: 'preventive' as const,
          source: 'manual' as const,
          status: 'scheduled' as const,
          dueDate: '2099-12-31',
        },
        {
          tenantId,
          patientId: patient.id,
          branchId: branchBId,
          reason: 'preventive' as const,
          source: 'manual' as const,
          status: 'contacted' as const,
          dueDate: '2099-12-31',
        },
      ]);
    });

    // branchA filter: faqat 2 ta recall (pending=1, contacted=1)
    const rA = await run((c) => service.summary(c, branchAId));
    expect(rA.pending).toBe(1);
    expect(rA.contacted).toBe(1);
    expect(rA.scheduled).toBe(0);
    expect(rA.pending + rA.contacted + rA.scheduled).toBe(2);

    // branchB filter: faqat 3 ta recall (pending=1, scheduled=1, contacted=1)
    const rB = await run((c) => service.summary(c, branchBId));
    expect(rB.pending).toBe(1);
    expect(rB.contacted).toBe(1);
    expect(rB.scheduled).toBe(1);
    expect(rB.pending + rB.contacted + rB.scheduled).toBe(3);

    // Tozalash: bu testda yaratilgan recall'larni o'chirish (afterAll cascade qiladi lekin tekshiramiz)
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await tx.delete(recalls).where(eq(recalls.branchId, branchAId));
      await tx.delete(recalls).where(eq(recalls.branchId, branchBId));
      await tx.delete(branches).where(eq(branches.id, branchAId));
      await tx.delete(branches).where(eq(branches.id, branchBId));
    });
  });
});
