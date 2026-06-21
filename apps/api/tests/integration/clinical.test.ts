/**
 * Clinical smoke test (CLI-99 refactor safety net) — 4 sub-domenning asosiy
 * service operatsiyalarini REAL DB'da tekshiradi. Refactor'dan OLDIN yashil bo'lishi shart;
 * refactor'dan KEYIN o'zgarmasdan yana yashil bo'lishi kerak (before/after invariant).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env clinical`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { diagnoses, patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createDiagnosesService } from '../../src/modules/clinical/diagnoses/diagnoses.service.ts';
import { createToothChartsService } from '../../src/modules/clinical/tooth-charts/tooth-charts.service.ts';
import { createTreatmentPlansService } from '../../src/modules/clinical/treatment-plans/treatment-plans.service.ts';
import { createVisitNotesService } from '../../src/modules/clinical/visit-notes/visit-notes.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const diagnosesSvc = createDiagnosesService({ db });
const plansSvc = createTreatmentPlansService({ audit: noopAudit });
const notesSvc = createVisitNotesService({ audit: noopAudit });
const chartsSvc = createToothChartsService({ audit: noopAudit });

const ctx = (tx: DbOrTx, tenantId: string, userId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: userId }
            : undefined,
  }) as unknown as Context;

/** Har `run` o'z (commit qilinadigan) transaction'i — cross-run persistence shu orqali. */
const run = <T>(tenantId: string, userId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(ctx(tx, tenantId, userId));
  });

let tenantAId: string;
let tenantBId: string;
let doctorAId: string;
let patientAId: string;
let diagnosisId: string;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [ownerA] = await db
    .insert(users)
    .values({ phone: '+998900000050', passwordHash: 'x', fullName: 'Doctor A' })
    .returning({ id: users.id });
  doctorAId = ownerA!.id;
  const [ownerB] = await db
    .insert(users)
    .values({ phone: '+998900000051', passwordHash: 'x', fullName: 'Owner B' })
    .returning({ id: users.id });

  const [tenantA] = await db
    .insert(tenants)
    .values({ name: 'CA', slug: 'ca-clinic', ownerUserId: doctorAId })
    .returning({ id: tenants.id });
  tenantAId = tenantA!.id;
  const [tenantB] = await db
    .insert(tenants)
    .values({ name: 'CB', slug: 'cb-clinic', ownerUserId: ownerB!.id })
    .returning({ id: tenants.id });
  tenantBId = tenantB!.id;

  patientAId = await run(tenantAId, doctorAId, async (c) => {
    const scoped = c.get('db') as DbOrTx;
    const [p] = await scoped
      .insert(patients)
      .values({ tenantId: tenantAId, fullName: 'Test Bemor', phone: '+998901112233' })
      .returning({ id: patients.id });
    return p!.id;
  });

  const [dg] = await db
    .insert(diagnoses)
    .values({ code: 'K02.1', nameUz: 'Kariyes', nameRu: 'Кариес', category: 'K02' })
    .returning({ id: diagnoses.id });
  diagnosisId = dg!.id;
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  await db.execute(sql`DELETE FROM diagnoses WHERE code = 'K02.1'`);
});

describe('clinical smoke — real DB', () => {
  test("diagnoses — platform katalog qaytadi (RLS yo'q)", async () => {
    const list = await diagnosesSvc.list();
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((d) => d.code === 'K02.1')).toBe(true);
  });

  test('treatment-plan create → get (stages bilan, RLS tx)', async () => {
    const created = await run(tenantAId, doctorAId, (c) =>
      plansSvc.createPlan(c, {
        patientId: patientAId,
        doctorId: doctorAId,
        title: 'Reja 1',
        stages: [{ serviceName: 'Plomba', estimatedVisits: 1, cost: 100000 }],
      }),
    );
    expect(created).not.toBeNull();
    expect(created!.title).toBe('Reja 1');
    expect(created!.stages).toHaveLength(1);
    // numeric(.,2) — DB '100000.00' qaytaradi; raqamiy qiymatni solishtir
    expect(Number(created!.totalCost)).toBe(100000);
  });

  test("visit-note create (deductStock yon ta'sirsiz — DI ixtiyoriy)", async () => {
    const note = await run(tenantAId, doctorAId, (c) =>
      notesSvc.create(c, {
        patientId: patientAId,
        doctorId: doctorAId,
        assessmentDiagnoses: [diagnosisId],
        performedServices: [],
        subjective: "Og'riq",
      }),
    );
    expect(note).toBeTruthy();
    expect(note!.subjective).toBe("Og'riq");
  });

  test('tooth-chart create → latest (states bilan, RLS tx)', async () => {
    const chart = await run(tenantAId, doctorAId, (c) =>
      chartsSvc.create(c, {
        patientId: patientAId,
        isPrimaryDentition: false,
        states: [{ toothNumber: 11, surface: 'whole', state: 'caries', diagnosisId }],
      }),
    );
    expect(chart.states).toHaveLength(1);
    const latest = await run(tenantAId, doctorAId, (c) => chartsSvc.getLatest(c, patientAId));
    expect(latest!.id).toBe(chart.id);
  });

  test('CLI-191: tooth-chart list states bilan qaytadi (surface + diagnosisId)', async () => {
    await run(tenantAId, doctorAId, (c) =>
      chartsSvc.create(c, {
        patientId: patientAId,
        isPrimaryDentition: false,
        states: [{ toothNumber: 16, surface: 'O', state: 'filling', diagnosisId }],
      }),
    );
    const list = await run(tenantAId, doctorAId, (c) => chartsSvc.list(c, patientAId));
    expect(list.length).toBeGreaterThan(0);
    // har snapshot states ni o'z ichiga oladi (CLI-191 — tarix ko'rgichi uchun)
    const withSurface = list.flatMap((ch) => ch.states).find((s) => s.surface === 'O');
    expect(withSurface).toBeTruthy();
    expect(withSurface?.diagnosisId).toBe(diagnosisId);
  });

  test("RLS scope — tenant B bemor A rejalarini ko'rmaydi", async () => {
    const plans = await run(tenantBId, doctorAId, (c) => plansSvc.listPlans(c, patientAId));
    expect(plans).toHaveLength(0);
  });
});
