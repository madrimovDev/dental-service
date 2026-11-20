/**
 * FW-1 integratsiya seam'i (FT-04 × FT-01): bemorning doimiy chegirmasi (`newStagePricer`)
 * FT-01'ning YANGI bosqich/narx yo'llarida ham qo'llanadi:
 *   - POST /treatment-plans/{id}/stages (addStage)
 *   - POST /treatment-plans/completed-work (recordCompletedWork)
 *   - PATCH /treatment-stages/{id} cost/serviceId qayta narxlash (listPrice/discountPercent qayta snapshot)
 *   - tenant `max_discount_percent` chegarasi (min(pct, max))
 * Reja `totalCost` = netto bosqichlar yig'indisi (FT-07 bot «Davolash rejam» shu qiymatni ko'rsatadi).
 *
 * REAL DB + REAL HTTP + provisioning rol shablonlari (Doctor — `discount.give`siz, `@owner` EMAS).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/ft-04-ft01-stage-pricer-seam.test.ts
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
  tenantSettings,
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
let svcA: string; // 200 000
let svcB: string; // 300 000
let doctorId: string;
let doctorToken: string;

const inTenant = <T>(fn: (tx: typeof db) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx as unknown as typeof db);
  });

// biome-ignore lint/suspicious/noExplicitAny: test javob shakli
const call = async (
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> => {
  const res = await createApp().request(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${doctorToken}`,
      'x-real-ip': `10.207.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const newPatient = async (name: string, pct: string | null) =>
  inTenant(async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: name, defaultDiscountPercent: pct })
      .returning({ id: patients.id });
    return p!.id;
  });

const stageRow = async (id: string) =>
  inTenant(async (tx) => {
    const [s] = await tx
      .select({
        cost: treatmentStages.cost,
        listPrice: treatmentStages.listPrice,
        discountPercent: treatmentStages.discountPercent,
        planId: treatmentStages.treatmentPlanId,
      })
      .from(treatmentStages)
      .where(eq(treatmentStages.id, id));
    return s!;
  });

const planTotal = async (planId: string) =>
  inTenant(async (tx) => {
    const [p] = await tx
      .select({ totalCost: treatmentPlans.totalCost })
      .from(treatmentPlans)
      .where(eq(treatmentPlans.id, planId));
    return Number(p!.totalCost);
  });

const setMaxDiscount = (max: number) =>
  inTenant((tx) =>
    tx
      .insert(tenantSettings)
      .values({ tenantId, maxDiscountPercent: max })
      .onConflictDoUpdate({ target: tenantSettings.tenantId, set: { maxDiscountPercent: max } }),
  );

const createPlan = async (patientId: string) => {
  const r = await call('POST', '/treatment-plans', {
    patientId,
    doctorId,
    title: 'Seam reja',
    stages: [{ serviceId: svcA, serviceName: 'A', cost: 1, estimatedVisits: 1 }],
  });
  expect(r.status).toBe(201);
  return r.json.data.id as string;
};

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
      tenantName: 'FW1 Seam',
      ownerPhone: '+998900207000',
      ownerFullName: 'Owner Seam',
      ownerPassword: 'Passw0rd!x',
      defaultLanguage: 'uz',
    }),
  );
  tenantId = res.tenantId;
  branchId = await inTenant(async (tx) => {
    const [b] = await tx.select({ id: branches.id }).from(branches).limit(1);
    return b!.id;
  });
  const [u] = await db
    .insert(users)
    .values({ phone: '+998900207001', passwordHash: 'x', fullName: 'Doc Seam' })
    .returning({ id: users.id });
  doctorId = u!.id;
  await inTenant(async (tx) => {
    const [r] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.templateKey, 'doctor'));
    await tx.insert(userAssignments).values({
      userId: doctorId,
      tenantId,
      branchId,
      roleId: r!.id,
      isActive: true,
      acceptedAt: new Date(),
    });
    const [a] = await tx
      .insert(services)
      .values({ tenantId, code: 'SEAM-A', nameUz: 'Plomba' })
      .returning({ id: services.id });
    const [b] = await tx
      .insert(services)
      .values({ tenantId, code: 'SEAM-B', nameUz: 'Koronka' })
      .returning({ id: services.id });
    svcA = a!.id;
    svcB = b!.id;
    await tx.insert(servicePrices).values([
      { serviceId: svcA, branchId, price: '200000' },
      { serviceId: svcB, branchId, price: '300000' },
    ]);
  });
  const perms = templatePerms('doctor');
  expect(perms).not.toContain('discount.give');
  expect(perms).not.toContain('@owner');
  doctorToken = (
    await signAccess({
      sub: doctorId,
      atid: tenantId,
      abid: branchId,
      perms,
      roleKey: 'doctor',
      lang: 'uz',
    })
  ).token;
});

describe('FT-04 × FT-01 — bemor doimiy chegirmasi FT-01 bosqich yo‘llarida', () => {
  test('POST /treatment-plans/{id}/stages: katalog + erkin bosqich netto, snapshot, totalCost netto', async () => {
    await setMaxDiscount(100);
    const patientId = await newPatient('Seam 10%', '10.00');
    const planId = await createPlan(patientId);
    const r = await call('POST', `/treatment-plans/${planId}/stages`, {
      serviceId: svcB,
      serviceName: 'B',
      cost: 1,
      estimatedVisits: 1,
    });
    expect(r.status).toBe(201);
    const s = await stageRow(r.json.data.id);
    expect(Number(s.cost)).toBe(270000);
    expect(s.listPrice).toBe('300000.00');
    expect(s.discountPercent).toBe('10.00');

    const free = await call('POST', `/treatment-plans/${planId}/stages`, {
      serviceName: 'Erkin',
      cost: 50000,
      estimatedVisits: 1,
    });
    expect(free.status).toBe(201);
    const f = await stageRow(free.json.data.id);
    expect(Number(f.cost)).toBe(45000);
    expect(f.listPrice).toBe('50000.00');
    expect(f.discountPercent).toBe('10.00');

    // createPlan 180 000 + 270 000 + 45 000 — FT-07 bot «Davolash rejam» summasi shu.
    expect(await planTotal(planId)).toBe(495000);
  });

  test('POST /treatment-plans/completed-work: bosqich netto + snapshot, reja totalCost netto', async () => {
    await setMaxDiscount(100);
    const patientId = await newPatient('Seam CW', '10.00');
    const r = await call('POST', '/treatment-plans/completed-work', {
      patientId,
      items: [{ serviceId: svcA, serviceName: 'A', toothNumbers: [16], cost: 1 }],
    });
    expect(r.status).toBe(201);
    const st = r.json.data.stages[0];
    expect(Number(st.cost)).toBe(180000);
    const s = await stageRow(st.id);
    expect(s.listPrice).toBe('200000.00');
    expect(s.discountPercent).toBe('10.00');
    expect(await planTotal(r.json.data.planId)).toBe(180000);
  });

  test('PATCH /treatment-stages/{id} serviceId o‘zgarishi: netto qayta narx, snapshot yangilanadi', async () => {
    await setMaxDiscount(100);
    const patientId = await newPatient('Seam PATCH', '10.00');
    const planId = await createPlan(patientId);
    const [stage] = await inTenant((tx) =>
      tx
        .select({ id: treatmentStages.id })
        .from(treatmentStages)
        .where(eq(treatmentStages.treatmentPlanId, planId)),
    );
    const r = await call('PATCH', `/treatment-stages/${stage!.id}`, { serviceId: svcB });
    expect(r.status).toBe(200);
    const s = await stageRow(stage!.id);
    expect(Number(s.cost)).toBe(270000);
    expect(s.listPrice).toBe('300000.00');
    expect(s.discountPercent).toBe('10.00');
    expect(await planTotal(planId)).toBe(270000);

    // Erkin narx (serviceId olib tashlanadi) — cost brutto sifatida qabul qilinib netto saqlanadi.
    const r2 = await call('PATCH', `/treatment-stages/${stage!.id}`, {
      serviceId: null,
      cost: 100000,
    });
    expect(r2.status).toBe(200);
    const s2 = await stageRow(stage!.id);
    expect(Number(s2.cost)).toBe(90000);
    expect(s2.listPrice).toBe('100000.00');
    expect(s2.discountPercent).toBe('10.00');

    // Faqat serviceName o'zgarishi narxga tegmaydi (qayta chegirma qo'llanmaydi).
    const r3 = await call('PATCH', `/treatment-stages/${stage!.id}`, { serviceName: 'Yangi nom' });
    expect(r3.status).toBe(200);
    expect(Number((await stageRow(stage!.id)).cost)).toBe(90000);
  });

  test('tenant max_discount_percent=5: bemor 10% → 5% bilan cheklanadi (addStage)', async () => {
    const patientId = await newPatient('Seam cap', '10.00');
    const planId = await createPlan(patientId);
    await setMaxDiscount(5);
    try {
      const r = await call('POST', `/treatment-plans/${planId}/stages`, {
        serviceId: svcA,
        serviceName: 'A',
        cost: 1,
        estimatedVisits: 1,
      });
      expect(r.status).toBe(201);
      const s = await stageRow(r.json.data.id);
      expect(Number(s.cost)).toBe(190000);
      expect(s.listPrice).toBe('200000.00');
      expect(s.discountPercent).toBe('5.00');
    } finally {
      await setMaxDiscount(100);
    }
  });

  test('chegirmasiz bemor: addStage brutto, listPrice = narx, discountPercent null', async () => {
    const patientId = await newPatient('Seam 0', null);
    const planId = await createPlan(patientId);
    const r = await call('POST', `/treatment-plans/${planId}/stages`, {
      serviceId: svcA,
      serviceName: 'A',
      cost: 1,
      estimatedVisits: 1,
    });
    expect(r.status).toBe(201);
    const s = await stageRow(r.json.data.id);
    expect(Number(s.cost)).toBe(200000);
    expect(s.discountPercent).toBeNull();
  });
});
