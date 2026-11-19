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
  patients,
  permissions as permissionsTable,
  roles,
  servicePrices,
  services,
  treatmentPlans,
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
