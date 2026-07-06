/**
 * CLI-431 — retention metrikasi branch-invariant (asimmetriya tuzatilgan). `recall-
 * efficacy` ham tenant-wide (branch-invariant). `procedureMix` branch-scope saqlanadi
 * (regressiya yo'q). `cli-243-dental-analytics.test.ts` seed patternidan (3 filial). REAL DB.
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-431`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  appointments,
  branches,
  cashierTransactionItems,
  cashierTransactions,
  patients,
  recalls,
  tenants,
  users,
} from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createReportsService } from '../../src/modules/reports/reports.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const service = createReportsService({ audit: noopAudit });
let tenantId: string;
let ownerId: string;
let branchAId: string;
let branchBId: string;
let branchCId: string;

const ctx = (tx: DbOrTx): Context =>
  ({ get: (k: string) => (k === 'db' ? tx : undefined) }) as unknown as Context;

const RANGE = { from: '2026-05-01', to: '2026-05-31' };

const run = <T>(fn: (c: Context) => Promise<T>): Promise<T> =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx));
  });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000070', passwordHash: 'x', fullName: 'Doc CLI431' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner');
  ownerId = owner.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI-431 Clinic', slug: 'cli-431-clinic', ownerUserId: owner.id })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [bA, bB, bC] = await tx
      .insert(branches)
      .values([
        { tenantId, name: 'Filial A' },
        { tenantId, name: 'Filial B' },
        { tenantId, name: 'Filial C' },
      ])
      .returning({ id: branches.id });
    if (!bA || !bB || !bC) throw new Error('branches');
    branchAId = bA.id;
    branchBId = bB.id;
    branchCId = bC.id;

    // 10 yangi bemor — oraliqda yaratilgan (branch-siz, tenant-level, Qaror #29).
    const newPatients = await tx
      .insert(patients)
      .values(
        Array.from({ length: 10 }, (_, i) => ({
          tenantId,
          fullName: `Yangi ${i}`,
          createdAt: new Date('2026-05-15T10:00:00+05:00'),
        })),
      )
      .returning({ id: patients.id });

    // 4 qaytgan bemor — oraliqdan OLDIN yaratilgan, oraliqda yozilgan: 2 ta b1, 1 ta b2, 1 ta b3.
    const returningPatients = await tx
      .insert(patients)
      .values(
        Array.from({ length: 4 }, (_, i) => ({
          tenantId,
          fullName: `Qaytgan ${i}`,
          createdAt: new Date('2026-01-01T10:00:00+05:00'),
        })),
      )
      .returning({ id: patients.id });
    if (returningPatients.length !== 4) throw new Error('returning patients');

    const branchForReturning = [branchAId, branchAId, branchBId, branchCId];
    await tx.insert(appointments).values(
      returningPatients.map((p, i) => ({
        tenantId,
        branchId: branchForReturning[i] as string,
        patientId: p.id,
        doctorId: ownerId,
        startTime: new Date(`2026-05-2${i}T09:00:00+05:00`),
        endTime: new Date(`2026-05-2${i}T10:00:00+05:00`),
        status: 'completed' as const,
      })),
    );

    // procedureMix branch-scope regressiya tekshiruvi uchun — Filial A'ga xos sale.
    const [txA] = await tx
      .insert(cashierTransactions)
      .values({
        tenantId,
        branchId: branchAId,
        patientId: newPatients[0]?.id,
        receiptNumber: 'CLI431-A1',
        totalAmount: '150000',
        paidAmount: '150000',
        paymentMethod: 'cash',
        type: 'payment',
        status: 'completed',
        createdAt: new Date('2026-05-16T10:00:00+05:00'),
      })
      .returning({ id: cashierTransactions.id });
    if (!txA) throw new Error('txA');
    await tx.insert(cashierTransactionItems).values({
      transactionId: txA.id,
      serviceName: 'Filial-A-xizmat',
      quantity: 1,
      unitPrice: '150000',
      subtotal: '150000',
    });

    // Recall'lar — branch-siz, tenant-wide (o'zgarmaydi): 2 pending, 1 scheduled → converted=1.
    // A8 (CLI-438): recalls_patient_preventive_open_unique bitta bemorga bir vaqtda
    // faqat bitta ochiq 'preventive' recallga ruxsat beradi — ikkinchi 'pending'
    // qator boshqa reason bilan (recallEfficacy status bo'yicha sanaydi, reason'dan
    // mustaqil).
    await tx.insert(recalls).values(
      (
        [
          { status: 'pending', reason: 'preventive' },
          { status: 'pending', reason: 'treatment_followup' },
          { status: 'scheduled', reason: 'preventive' },
        ] as const
      ).map(({ status, reason }) => ({
        tenantId,
        patientId: returningPatients[0]?.id as string,
        reason,
        source: 'manual' as const,
        status,
        dueDate: '2026-05-20',
        createdAt: new Date('2026-05-05T10:00:00+05:00'),
      })),
    );
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-431 — retention branch-invariant + recall-efficacy tenant-wide', () => {
  test('T1: retention (newPatients/returningPatients/retentionRate) branchId-invariant', async () => {
    const noBranch = await run((c) => service.dentalAnalytics(c, RANGE));
    const withA = await run((c) => service.dentalAnalytics(c, { ...RANGE, branchId: branchAId }));
    const withB = await run((c) => service.dentalAnalytics(c, { ...RANGE, branchId: branchBId }));
    const withC = await run((c) => service.dentalAnalytics(c, { ...RANGE, branchId: branchCId }));

    for (const r of [withA, withB, withC]) {
      expect(r.retention).toEqual(noBranch.retention);
    }
  });

  test('T2: aniq qiymatlar — 10 yangi, 4 qaytgan, rate = 4/14', async () => {
    const r = await run((c) => service.dentalAnalytics(c, RANGE));
    expect(r.retention.newPatients).toBe(10);
    expect(r.retention.returningPatients).toBe(4);
    expect(r.retention.retentionRate).toBeCloseTo(4 / 14, 10);
  });

  test('T3: recall-efficacy tenant-wide — branchId bilan/siz bir xil', async () => {
    const noBranch = await run((c) => service.dentalAnalytics(c, RANGE));
    const withA = await run((c) => service.dentalAnalytics(c, { ...RANGE, branchId: branchAId }));
    expect(withA.recallEfficacy).toEqual(noBranch.recallEfficacy);
    expect(noBranch.recallEfficacy.total).toBe(3);
    expect(noBranch.recallEfficacy.converted).toBe(1);
  });

  test('T4: procedureMix branch-scope saqlanadi (regressiya yo‘q)', async () => {
    const withA = await run((c) => service.dentalAnalytics(c, { ...RANGE, branchId: branchAId }));
    const withB = await run((c) => service.dentalAnalytics(c, { ...RANGE, branchId: branchBId }));

    expect(withA.procedureMix.find((p) => p.serviceName === 'Filial-A-xizmat')).toBeDefined();
    expect(withB.procedureMix.find((p) => p.serviceName === 'Filial-A-xizmat')).toBeUndefined();
  });
});
