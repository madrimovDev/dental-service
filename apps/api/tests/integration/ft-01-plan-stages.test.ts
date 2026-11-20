/**
 * FT-01.1 (CF-9/11) — reja bosqichini qo'shish/tahrirlash API (REAL HTTP `createApp()` + real DB).
 * Tokenlar REAL shablon permset'lari bilan (`@owner` EMAS): Doctor (`medical_record.edit` bor),
 * Receptionist (`medical_record.edit` YO'Q → 403).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/ft-01-plan-stages.test.ts
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { PERMISSIONS, ROLE_TEMPLATES } from '@dental/core';
import {
  branches,
  cashierTransactions,
  patients,
  permissions as permissionsTable,
  roles,
  servicePrices,
  services,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
  userAssignments,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import { createApp } from '../../src/app.ts';
import { db } from '../../src/db/client.ts';
import { signAccess } from '../../src/lib/jwt.ts';
import { provisionTenantInTx } from '../../src/modules/auth/auth.service.ts';

const templatePerms = (key: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === key);
  if (!t) throw new Error(`template not found: ${key}`);
  return [...t.permissions];
};

let tenantId: string;
let branchId: string;
let patientId: string;
let serviceId: string;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};

const inTenant = <T>(fn: (tx: typeof db) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx as unknown as typeof db);
  });

const call = (token: string, method: string, path: string, body?: unknown) =>
  createApp().request(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-real-ip': `10.201.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const errCode = async (res: Response) =>
  ((await res.json()) as { error?: { code?: string } }).error?.code;

type StageDto = {
  id: string;
  treatmentPlanId: string;
  sequence: number;
  serviceId: string | null;
  serviceName: string;
  toothNumbers: number[] | null;
  cost: string;
  status: string;
  acceptance: string;
  notes: string | null;
};
type PlanDto = { id: string; totalCost: string; totalVisits: number; stages: StageDto[] };

const createPlan = async (stages: unknown[] = []) => {
  const res = await call(tokens.doctor as string, 'POST', '/treatment-plans', {
    patientId,
    doctorId: ids.doctor,
    title: 'FT01 reja',
    stages,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: PlanDto }).data;
};

const getPlan = async (id: string) => {
  const res = await call(tokens.doctor as string, 'GET', `/treatment-plans/${id}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: PlanDto }).data;
};

const setPlanStatus = (id: string, status: 'completed' | 'cancelled' | 'in_progress') =>
  inTenant((tx) => tx.update(treatmentPlans).set({ status }).where(eq(treatmentPlans.id, id)));

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  for (const p of PERMISSIONS) {
    await db
      .insert(permissionsTable)
      .values({
        code: p.code,
        category: p.category,
        descriptionUz: p.descriptionUz,
        descriptionRu: p.descriptionRu,
      })
      .onConflictDoNothing();
  }
  const res = await db.transaction((tx) =>
    provisionTenantInTx(tx, {
      tenantName: 'FT01 Stages',
      ownerPhone: '+998900201000',
      ownerFullName: 'Owner FT01',
      ownerPassword: 'Passw0rd!x',
      defaultLanguage: 'uz',
    }),
  );
  tenantId = res.tenantId;
  branchId = await inTenant(async (tx) => {
    const [b] = await tx.select({ id: branches.id }).from(branches).limit(1);
    if (!b) throw new Error('no branch provisioned');
    return b.id;
  });

  for (const [key, phone, name] of [
    ['doctor', '+998900201001', 'Doc FT01'],
    ['receptionist', '+998900201002', 'Reg FT01'],
  ] as const) {
    const [u] = await db
      .insert(users)
      .values({ phone, passwordHash: 'x', fullName: name })
      .returning({ id: users.id });
    if (!u) throw new Error('user insert failed');
    ids[key] = u.id;
    await inTenant(async (tx) => {
      const [r] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.templateKey, key));
      if (!r) throw new Error(`role ${key} not seeded`);
      await tx
        .insert(userAssignments)
        .values({ userId: u.id, tenantId, roleId: r.id, isActive: true, acceptedAt: new Date() });
    });
    tokens[key] = (
      await signAccess({
        sub: u.id,
        atid: tenantId,
        abid: branchId,
        perms: templatePerms(key),
        roleKey: key,
        lang: 'uz',
      })
    ).token;
  }

  await inTenant(async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor FT01' })
      .returning({ id: patients.id });
    patientId = p!.id;
    const [s] = await tx
      .insert(services)
      .values({ tenantId, code: 'FT01-PL', nameUz: 'Plomba' })
      .returning({ id: services.id });
    serviceId = s!.id;
    await tx.insert(servicePrices).values({ serviceId, branchId, price: '250000' });
  });
});

describe('FT-01.1 — POST /treatment-plans/{id}/stages', () => {
  test('Receptionist (medical_record.edit yo‘q) → 403', async () => {
    expect(templatePerms('receptionist')).not.toContain('medical_record.edit');
    const plan = await createPlan();
    const res = await call(
      tokens.receptionist as string,
      'POST',
      `/treatment-plans/${plan.id}/stages`,
      { serviceName: 'Tozalash', cost: 10000 },
    );
    expect(res.status).toBe(403);
  });

  test('Doctor mavjud rejaga bosqich qo‘shadi → 201, sequence davom etadi, pending/proposed', async () => {
    expect(templatePerms('doctor')).toContain('medical_record.edit');
    const plan = await createPlan([{ serviceName: 'Ko‘rik', cost: 50000 }]);
    const res = await call(tokens.doctor as string, 'POST', `/treatment-plans/${plan.id}/stages`, {
      serviceName: 'Plomba 16',
      toothNumbers: [16],
      cost: 120000,
      resultingToothState: 'filling',
    });
    expect(res.status).toBe(201);
    const stage = ((await res.json()) as { data: StageDto }).data;
    expect(stage.treatmentPlanId).toBe(plan.id);
    expect(stage.sequence).toBe(2);
    expect(stage.status).toBe('pending');
    expect(stage.acceptance).toBe('proposed');
    expect(stage.toothNumbers).toEqual([16]);
    expect(Number(stage.cost)).toBe(120000);

    const after = await getPlan(plan.id);
    expect(after.stages.map((s) => s.sequence)).toEqual([1, 2]);
  });

  test('serviceId + filialda faol narx → narx serverda (client cost e’tiborsiz, CLI-443)', async () => {
    const plan = await createPlan();
    const res = await call(tokens.doctor as string, 'POST', `/treatment-plans/${plan.id}/stages`, {
      serviceId,
      serviceName: 'Plomba',
      toothNumbers: [26],
      cost: 1,
    });
    expect(res.status).toBe(201);
    const stage = ((await res.json()) as { data: StageDto }).data;
    expect(stage.serviceId).toBe(serviceId);
    expect(Number(stage.cost)).toBe(250000);
  });

  test('mavjud bo‘lmagan serviceId → 400 ownership.*', async () => {
    const plan = await createPlan();
    const res = await call(tokens.doctor as string, 'POST', `/treatment-plans/${plan.id}/stages`, {
      serviceId: crypto.randomUUID(),
      serviceName: 'Soxta',
      cost: 1000,
    });
    expect(res.status).toBe(400);
    expect(await errCode(res)).toMatch(/^ownership\./);
  });

  test('yaroqsiz FDI tish raqami → 400', async () => {
    const plan = await createPlan();
    const res = await call(tokens.doctor as string, 'POST', `/treatment-plans/${plan.id}/stages`, {
      serviceName: 'Plomba',
      toothNumbers: [19],
      cost: 1000,
    });
    expect(res.status).toBe(400);
  });

  test.each(['completed', 'cancelled'] as const)('%s reja → 409 plan.locked', async (status) => {
    const plan = await createPlan();
    await setPlanStatus(plan.id, status);
    const res = await call(tokens.doctor as string, 'POST', `/treatment-plans/${plan.id}/stages`, {
      serviceName: 'Plomba',
      cost: 1000,
    });
    expect(res.status).toBe(409);
    expect(await errCode(res)).toBe('plan.locked');
    const rows = await inTenant((tx) =>
      tx.select().from(treatmentStages).where(eq(treatmentStages.treatmentPlanId, plan.id)),
    );
    expect(rows.length).toBe(0);
  });

  test('mavjud bo‘lmagan reja → 404', async () => {
    const res = await call(
      tokens.doctor as string,
      'POST',
      `/treatment-plans/${crypto.randomUUID()}/stages`,
      { serviceName: 'Plomba', cost: 1000 },
    );
    expect(res.status).toBe(404);
  });
});

describe('FT-01.1 — PATCH /treatment-stages/{id} bosqich tahriri', () => {
  const firstStage = async (stages: unknown[]) => {
    const plan = await createPlan(stages);
    const stage = plan.stages[0];
    if (!stage) throw new Error('no stage');
    return { plan, stage };
  };
  const patch = (stageId: string, body: unknown, token = tokens.doctor as string) =>
    call(token, 'PATCH', `/treatment-stages/${stageId}`, body);
  const readStage = async (id: string) => {
    const [row] = await inTenant((tx) =>
      tx.select().from(treatmentStages).where(eq(treatmentStages.id, id)),
    );
    return row!;
  };
  const allocate = (stageId: string, amount: string) =>
    inTenant(async (tx) => {
      const [t] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          branchId,
          patientId,
          totalAmount: amount,
          paidAmount: amount,
          paymentMethod: 'cash',
        })
        .returning({ id: cashierTransactions.id });
      await tx
        .insert(treatmentStagePayments)
        .values({ tenantId, transactionId: t!.id, stageId, amount });
    });

  test('pending + allocation yo‘q: serviceName/cost/toothNumbers/notes tahrirlanadi → 200', async () => {
    const { stage } = await firstStage([{ serviceName: 'Ko‘rik', cost: 50000 }]);
    const res = await patch(stage.id, {
      serviceName: 'Plomba 36',
      cost: 80000,
      toothNumbers: [36],
      notes: 'distal',
    });
    expect(res.status).toBe(200);
    const dto = ((await res.json()) as { data: StageDto }).data;
    expect(dto.serviceName).toBe('Plomba 36');
    expect(Number(dto.cost)).toBe(80000);
    expect(dto.toothNumbers).toEqual([36]);
    expect(dto.notes).toBe('distal');
    const row = await readStage(stage.id);
    expect(Number(row.cost)).toBe(80000);
    expect(row.toothNumbers).toEqual([36]);
  });

  test('serviceId o‘rnatilsa narx filial narxidan (CLI-443) — client cost e’tiborsiz', async () => {
    const { stage } = await firstStage([{ serviceName: 'Erkin', cost: 1000 }]);
    const res = await patch(stage.id, { serviceId, serviceName: 'Plomba', cost: 5 });
    expect(res.status).toBe(200);
    const row = await readStage(stage.id);
    expect(row.serviceId).toBe(serviceId);
    expect(Number(row.cost)).toBe(250000);
  });

  test('mavjud bo‘lmagan serviceId → 400 ownership.*', async () => {
    const { stage } = await firstStage([{ serviceName: 'Erkin', cost: 1000 }]);
    const res = await patch(stage.id, { serviceId: crypto.randomUUID() });
    expect(res.status).toBe(400);
    expect(await errCode(res)).toMatch(/^ownership\./);
  });

  test('yaroqsiz FDI → 400', async () => {
    const { stage } = await firstStage([{ serviceName: 'Erkin', cost: 1000 }]);
    const res = await patch(stage.id, { toothNumbers: [10] });
    expect(res.status).toBe(400);
  });

  test('Receptionist → 403, bosqich o‘zgarmaydi', async () => {
    const { stage } = await firstStage([{ serviceName: 'Erkin', cost: 1000 }]);
    const res = await patch(stage.id, { cost: 1 }, tokens.receptionist as string);
    expect(res.status).toBe(403);
    expect(Number((await readStage(stage.id)).cost)).toBe(1000);
  });

  test('in_progress bosqich: cost/toothNumbers/serviceId → 409 stage.locked, o‘zgarmaydi', async () => {
    const { plan, stage } = await firstStage([
      { serviceName: 'Kanal', cost: 300000, toothNumbers: [46] },
    ]);
    await setPlanStatus(plan.id, 'in_progress');
    await inTenant((tx) =>
      tx
        .update(treatmentStages)
        .set({ status: 'in_progress', acceptance: 'accepted' })
        .where(eq(treatmentStages.id, stage.id)),
    );
    for (const body of [{ cost: 1 }, { toothNumbers: [47] }, { serviceId }]) {
      const res = await patch(stage.id, body);
      expect(res.status).toBe(409);
      expect(await errCode(res)).toBe('stage.locked');
    }
    const row = await readStage(stage.id);
    expect(Number(row.cost)).toBe(300000);
    expect(row.toothNumbers).toEqual([46]);
    expect(row.serviceId).toBeNull();
  });

  test('in_progress bosqich: notes/resultingToothState va o‘zgarmagan cost → 200 (qulf emas)', async () => {
    const { plan, stage } = await firstStage([
      { serviceName: 'Kanal', cost: 300000, toothNumbers: [46] },
    ]);
    await setPlanStatus(plan.id, 'in_progress');
    await inTenant((tx) =>
      tx
        .update(treatmentStages)
        .set({ status: 'in_progress', acceptance: 'accepted' })
        .where(eq(treatmentStages.id, stage.id)),
    );
    const res = await patch(stage.id, {
      notes: 'ikkinchi seans',
      resultingToothState: 'root_canal',
      cost: 300000,
    });
    expect(res.status).toBe(200);
    const row = await readStage(stage.id);
    expect(row.notes).toBe('ikkinchi seans');
    expect(row.resultingToothState).toBe('root_canal');
  });

  test('pending, lekin to‘lov allocation’i bor → 409 stage.locked', async () => {
    const { stage } = await firstStage([
      { serviceName: 'Plomba', cost: 100000, toothNumbers: [16] },
    ]);
    await allocate(stage.id, '50000');
    const res = await patch(stage.id, { cost: 90000 });
    expect(res.status).toBe(409);
    expect(await errCode(res)).toBe('stage.locked');
    expect(Number((await readStage(stage.id)).cost)).toBe(100000);
  });
});

describe('FT-01.1 — reja totalCost/totalVisits bosqichlar yig‘indisidan', () => {
  test('bosqich qo‘shilganda va narx tahrirlanganda totalCost qayta hisoblanadi', async () => {
    const plan = await createPlan([{ serviceName: 'Ko‘rik', cost: 50000, estimatedVisits: 1 }]);
    expect(Number(plan.totalCost)).toBe(50000);

    const add = await call(tokens.doctor as string, 'POST', `/treatment-plans/${plan.id}/stages`, {
      serviceName: 'Kanal 46',
      toothNumbers: [46],
      cost: 300000,
      estimatedVisits: 2,
    });
    expect(add.status).toBe(201);
    const added = ((await add.json()) as { data: StageDto }).data;
    let after = await getPlan(plan.id);
    expect(Number(after.totalCost)).toBe(350000);
    expect(after.totalVisits).toBe(3);

    const res = await call(tokens.doctor as string, 'PATCH', `/treatment-stages/${added.id}`, {
      cost: 280000,
    });
    expect(res.status).toBe(200);
    after = await getPlan(plan.id);
    expect(Number(after.totalCost)).toBe(330000);
  });

  test('stage.locked (rad) bo‘lsa totalCost o‘zgarmaydi', async () => {
    const plan = await createPlan([{ serviceName: 'Kanal', cost: 300000 }]);
    const stage = plan.stages[0]!;
    await inTenant((tx) =>
      tx.update(treatmentStages).set({ status: 'skipped' }).where(eq(treatmentStages.id, stage.id)),
    );
    const res = await call(tokens.doctor as string, 'PATCH', `/treatment-stages/${stage.id}`, {
      cost: 1,
    });
    expect(res.status).toBe(409);
    expect(Number((await getPlan(plan.id)).totalCost)).toBe(300000);
  });
});
