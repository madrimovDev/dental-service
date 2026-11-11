/**
 * UI-D3 — tish xaritasi backend (REAL DB):
 *  1) tashxis qidiruvi xatoga chidamli: «karies» / «kariyes» / ru «кариес» / sinonim «chirish» /
 *     harf xatosi «kariyse» / kod «k02.1» — bir tashxisni topadi; begona so'rov topmaydi;
 *  2) bitta tishga (va bitta yuzaga) bir nechta TURLI tashxis saqlanadi, bir xil tashxis
 *     takrorlansa bittaga qisqaradi;
 *  3) davolash rejasi bosqichi `toothNumbers` FDI (CL-01) tekshiruvidan o'tadi.
 *
 * Ishga tushirish: cd apps/api && bun test --env-file=../../.env ui-d3-diagnosis-search
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  diagnoses,
  patients,
  tenants,
  toothCharts,
  toothStates,
  users,
} from '@dental/db-schema';
import { eq, like, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createDiagnosesRepository } from '../../src/modules/clinical/diagnoses/diagnoses.repository.ts';
import { createToothChartsService } from '../../src/modules/clinical/tooth-charts/tooth-charts.service.ts';
import { createTreatmentPlanSchema } from '../../src/modules/clinical/treatment-plans/treatment-plans.schema.ts';

const PREFIX = 'ZZD3.';
const repo = createDiagnosesRepository({ db });
const noopAudit = { record: async () => {} } as unknown as AuditLogger;
const toothService = createToothChartsService({
  audit: noopAudit,
  ownership: {
    assertPatientExists: async () => {},
    assertVisitNoteBelongsToPatient: async () => {},
  } as never,
});

let tenantId: string;
let ownerId: string;
let patientId: string;
let dxCaries: string;
let dxPulpitis: string;

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: ownerId }
            : undefined,
  }) as unknown as Context;

const codes = async (q: string) => (await repo.list(q)).map((d) => d.code);

beforeAll(async () => {
  await db.delete(diagnoses).where(like(diagnoses.code, `${PREFIX}%`));
  const rows = await db
    .insert(diagnoses)
    .values([
      {
        code: `${PREFIX}1`,
        category: 'K02',
        nameUz: "Dentin kariyesi (o'rta)",
        nameRu: 'Кариес дентина',
      },
      {
        code: `${PREFIX}2`,
        category: 'K04',
        nameUz: 'Surunkali pulpit',
        nameRu: 'Хронический пульпит',
      },
    ])
    .returning({ id: diagnoses.id, code: diagnoses.code });
  dxCaries = rows.find((r) => r.code === `${PREFIX}1`)?.id as string;
  dxPulpitis = rows.find((r) => r.code === `${PREFIX}2`)?.id as string;

  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000903', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  ownerId = owner?.id as string;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'D3 Clinic', slug: 'd3-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  tenantId = tenant?.id as string;
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.insert(branches).values({ tenantId, name: 'B1' });
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'D3 Bemor' })
      .returning({ id: patients.id });
    patientId = p?.id as string;
  });
});

afterAll(async () => {
  await db.delete(diagnoses).where(like(diagnoses.code, `${PREFIX}%`));
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('UI-D3 — tashxis qidiruvi (real DB)', () => {
  test.each([
    ['karies', `${PREFIX}1`],
    ['kariyes', `${PREFIX}1`],
    ['KARIES', `${PREFIX}1`],
    ['кариес', `${PREFIX}1`],
    ['Кариес', `${PREFIX}1`],
    ['kariyse', `${PREFIX}1`], // harf xatosi
    ['chirish', `${PREFIX}1`], // sinonim (K02)
    ['k02', `${PREFIX}1`], // kod bo'yicha
    ['pulpit', `${PREFIX}2`],
    ['пульпит', `${PREFIX}2`],
  ])('«%s» → %s', async (q, expected) => {
    expect(await codes(q)).toContain(expected);
  });

  test('so`rov bir tashxisni boshqasi bilan aralashtirmaydi', async () => {
    const c = await codes('kariyes');
    expect(c).not.toContain(`${PREFIX}2`);
  });

  test('begona so`rov mos kelmaydi', async () => {
    expect(await codes('qqzzxx')).not.toContain(`${PREFIX}1`);
  });

  test('qidiruv natijasi ≤100', async () => {
    expect((await repo.list('a')).length).toBeLessThanOrEqual(100);
  });
});

describe('UI-D3 — bitta tishga bir nechta tashxis (real DB)', () => {
  test('bir tish+yuzada ikki turli tashxis saqlanadi, takror qisqaradi', async () => {
    const chart = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return toothService.create(ctx(tx), {
        patientId,
        isPrimaryDentition: false,
        states: [
          { toothNumber: 36, surface: 'O', state: 'caries', diagnosisId: dxCaries },
          { toothNumber: 36, surface: 'O', state: 'caries', diagnosisId: dxPulpitis },
          { toothNumber: 36, surface: 'O', state: 'caries', diagnosisId: dxCaries }, // takror
        ],
      });
    });
    const saved = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return tx.select().from(toothStates).where(eq(toothStates.toothChartId, chart.id));
    });
    expect(saved.map((s) => s.diagnosisId).sort()).toEqual([dxCaries, dxPulpitis].sort());
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await tx.delete(toothCharts).where(eq(toothCharts.id, chart.id));
    });
  });
});

describe('UI-D3 — stage toothNumbers FDI (CL-01)', () => {
  const base = {
    patientId: '00000000-0000-4000-8000-000000000001',
    doctorId: '00000000-0000-4000-8000-000000000002',
    title: 'Reja',
  };
  const parse = (toothNumbers: number[]) =>
    createTreatmentPlanSchema.safeParse({
      ...base,
      stages: [{ serviceName: 'X', cost: 0, toothNumbers }],
    });

  test('yaroqli doimiy + sut tishlari qabul qilinadi', () => {
    expect(parse([11, 18, 28, 36, 48, 51, 55, 85]).success).toBe(true);
  });
  test.each([
    [19],
    [29],
    [49],
    [56],
    [66],
    [9],
    [86],
    [10],
    [0],
  ])('yaroqsiz FDI %p rad etiladi', (n) => {
    expect(parse([n as number]).success).toBe(false);
  });
});
