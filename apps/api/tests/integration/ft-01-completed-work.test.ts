/**
 * FT-01.2 (CF-12) — «Bajarilgan ishni yozish» 2-rejim: `POST /treatment-plans/completed-work`
 * (REAL HTTP `createApp()` + real DB). Darhol `acceptance=accepted, status=completed` bosqich
 * X-3 yakunlash yo'li orqali (odontogramma snapshot, recall, BOM chiqimi) + reja qarzi.
 * Tokenlar REAL shablon permset'lari bilan (`@owner` EMAS): Doctor (`medical_record.edit` bor),
 * Receptionist (`medical_record.edit` YO'Q → 403; `patient.view` bilan balansni ko'radi).
 *
 *   cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/ft-01-completed-work.test.ts
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { PERMISSIONS, ROLE_TEMPLATES } from '@dental/core';
import {
  branches,
  patients,
  permissions as permissionsTable,
  recalls,
  roles,
  serviceMaterials,
  servicePrices,
  services,
  stockItems,
  stockMovements,
  toothCharts,
  toothStates,
  treatmentPlans,
  treatmentStages,
  userAssignments,
  users,
  visitNotes,
} from '@dental/db-schema';
import { and, desc, eq, sql } from 'drizzle-orm';
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
let serviceId: string;
let stockItemId: string;
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
      'x-real-ip': `10.202.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
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
  toothNumbers: number[] | null;
  cost: string;
  status: string;
  acceptance: string;
  resultingToothState: string | null;
};
type CompletedWorkDto = { planId: string; planCreated: boolean; stages: StageDto[] };

const newPatient = async (name: string) =>
  inTenant(async (tx) => {
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: name })
      .returning({ id: patients.id });
    return p!.id;
  });

const record = (body: unknown, token = tokens.doctor as string) =>
  call(token, 'POST', '/treatment-plans/completed-work', body);

const planStages = (planId: string) =>
  inTenant((tx) =>
    tx.select().from(treatmentStages).where(eq(treatmentStages.treatmentPlanId, planId)),
  );

const patientPlans = (patientId: string) =>
  inTenant((tx) => tx.select().from(treatmentPlans).where(eq(treatmentPlans.patientId, patientId)));

const insertPlan = (patientId: string, status: string) =>
  inTenant(async (tx) => {
    const [p] = await tx
      .insert(treatmentPlans)
      .values({
        tenantId,
        patientId,
        doctorId: ids.doctor as string,
        title: `Reja ${status}`,
        status: status as 'draft',
      })
      .returning({ id: treatmentPlans.id });
    return p!.id;
  });

const insertVisitNote = (patientId: string, extra: Partial<typeof visitNotes.$inferInsert> = {}) =>
  inTenant(async (tx) => {
    const [n] = await tx
      .insert(visitNotes)
      .values({ tenantId, patientId, doctorId: ids.doctor as string, ...extra })
      .returning({ id: visitNotes.id });
    return n!.id;
  });

const readVisitNote = async (id: string) => {
  const [row] = await inTenant((tx) => tx.select().from(visitNotes).where(eq(visitNotes.id, id)));
  return row!;
};

const latestToothState = async (patientId: string, tooth: number) => {
  const [chart] = await inTenant((tx) =>
    tx
      .select()
      .from(toothCharts)
      .where(eq(toothCharts.patientId, patientId))
      .orderBy(desc(toothCharts.createdAt))
      .limit(1),
  );
  if (!chart) return null;
  const [st] = await inTenant((tx) =>
    tx
      .select()
      .from(toothStates)
      .where(and(eq(toothStates.toothChartId, chart.id), eq(toothStates.toothNumber, tooth))),
  );
  return st?.state ?? null;
};

const countCharts = async (patientId: string) =>
  (
    await inTenant((tx) =>
      tx.select().from(toothCharts).where(eq(toothCharts.patientId, patientId)),
    )
  ).length;

const filling16 = () => ({
  serviceId,
  serviceName: 'Plomba',
  toothNumbers: [16],
  cost: 1,
  resultingToothState: 'filling',
});

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
      tenantName: 'FT01 Completed',
      ownerPhone: '+998900202000',
      ownerFullName: 'Owner FT01b',
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
    ['doctor', '+998900202001', 'Doc FT01b'],
    ['receptionist', '+998900202002', 'Reg FT01b'],
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
      await tx.insert(userAssignments).values({
        userId: u.id,
        tenantId,
        branchId,
        roleId: r.id,
        isActive: true,
        acceptedAt: new Date(),
      });
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
    const [s] = await tx
      .insert(services)
      .values({ tenantId, code: 'FT01B-PL', nameUz: 'Plomba' })
      .returning({ id: services.id });
    serviceId = s!.id;
    await tx.insert(servicePrices).values({ serviceId, branchId, price: '250000' });
    const [item] = await tx
      .insert(stockItems)
      .values({ tenantId, branchId, name: 'Kompozit', unit: 'g', quantity: '100' })
      .returning({ id: stockItems.id });
    stockItemId = item!.id;
    await tx.insert(serviceMaterials).values({
      tenantId,
      serviceId,
      itemId: stockItemId,
      qtyPerService: '2',
    });
  });
});

describe('FT-01.2 — POST /treatment-plans/completed-work', () => {
  test('Receptionist (medical_record.edit yo‘q) → 403, hech narsa yozilmaydi', async () => {
    expect(templatePerms('receptionist')).not.toContain('medical_record.edit');
    const patientId = await newPatient('Bemor R');
    const res = await record({ patientId, items: [filling16()] }, tokens.receptionist as string);
    expect(res.status).toBe(403);
    expect((await patientPlans(patientId)).length).toBe(0);
  });

  test('faol reja yo‘q → avtomatik «Bajarilgan ishlar» rejasi (in_progress), bosqich completed+accepted, X-3 hook’lari, reja qarzi', async () => {
    expect(templatePerms('doctor')).toContain('medical_record.edit');
    const patientId = await newPatient('Bemor A');
    const res = await record({ patientId, items: [filling16()] });
    expect(res.status).toBe(201);
    const dto = ((await res.json()) as { data: CompletedWorkDto }).data;
    expect(dto.planCreated).toBe(true);
    expect(dto.stages.length).toBe(1);
    const stage = dto.stages[0]!;
    expect(stage.status).toBe('completed');
    expect(stage.acceptance).toBe('accepted');
    expect(Number(stage.cost)).toBe(250000); // CLI-443: server narxi
    expect(stage.toothNumbers).toEqual([16]);

    const [plan] = await patientPlans(patientId);
    expect(plan!.id).toBe(dto.planId);
    expect(plan!.status).toBe('in_progress');
    expect(plan!.title).toMatch(/^Bajarilgan ishlar \d{4}-\d{2}$/);
    expect(plan!.doctorId).toBe(ids.doctor as string);
    expect(Number(plan!.totalCost)).toBe(250000);

    // X-3: odontogramma snapshot
    expect(await latestToothState(patientId, 16)).toBe('filling');
    // X-3: recall (treatment_followup) bosqichdan
    const rc = await inTenant((tx) =>
      tx.select().from(recalls).where(eq(recalls.sourceStageId, stage.id)),
    );
    expect(rc.length).toBe(1);
    expect(rc[0]!.assignedDoctorId).toBe(ids.doctor as string);
    // X-3 / FX-60: BOM ombor chiqimi (stage_auto)
    const mv = await inTenant((tx) =>
      tx.select().from(stockMovements).where(eq(stockMovements.sourceStageId, stage.id)),
    );
    expect(mv.length).toBe(1);
    expect(mv[0]!.reason).toBe('stage_auto');
    expect(Number(mv[0]!.quantity)).toBe(2);

    // Reja qarziga tushadi — Receptionist (patient.view) balansda ko'radi.
    const bal = await call(tokens.receptionist as string, 'GET', `/patients/${patientId}/balance`);
    expect(bal.status).toBe(200);
    const b = ((await bal.json()) as { data: { planDebt: number } }).data;
    expect(b.planDebt).toBe(250000);
  });

  test('ikkinchi yozuv shu oyning avto-rejasiga qo‘shiladi (yangi reja yaratilmaydi)', async () => {
    const patientId = await newPatient('Bemor B');
    const first = (
      (await (await record({ patientId, items: [filling16()] })).json()) as {
        data: CompletedWorkDto;
      }
    ).data;
    const res = await record({
      patientId,
      items: [{ serviceName: 'Tozalash', cost: 40000 }],
    });
    expect(res.status).toBe(201);
    const dto = ((await res.json()) as { data: CompletedWorkDto }).data;
    expect(dto.planCreated).toBe(false);
    expect(dto.planId).toBe(first.planId);
    expect(dto.stages[0]!.sequence).toBe(2);
    expect((await patientPlans(patientId)).length).toBe(1);
    const [plan] = await patientPlans(patientId);
    expect(Number(plan!.totalCost)).toBe(290000);
  });

  test('bemorning joriy (accepted) rejasi bo‘lsa — shunga qo‘shiladi; ko‘p xizmat bitta so‘rovda', async () => {
    const patientId = await newPatient('Bemor C');
    const planId = await insertPlan(patientId, 'accepted');
    const res = await record({
      patientId,
      items: [filling16(), { serviceName: 'Kanal 46', toothNumbers: [46], cost: 300000 }],
    });
    expect(res.status).toBe(201);
    const dto = ((await res.json()) as { data: CompletedWorkDto }).data;
    expect(dto.planCreated).toBe(false);
    expect(dto.planId).toBe(planId);
    expect(dto.stages.map((s) => s.status)).toEqual(['completed', 'completed']);
    expect(dto.stages.map((s) => s.sequence)).toEqual([1, 2]);
    expect((await patientPlans(patientId)).length).toBe(1);
  });

  test('aniq planId (draft/presented) → 409 plan.not_active, bosqich yozilmaydi', async () => {
    const patientId = await newPatient('Bemor D');
    for (const status of ['draft', 'presented']) {
      const planId = await insertPlan(patientId, status);
      const res = await record({ patientId, planId, items: [filling16()] });
      expect(res.status).toBe(409);
      expect(await errCode(res)).toBe('plan.not_active');
      expect((await planStages(planId)).length).toBe(0);
    }
  });

  test.each(['completed', 'cancelled'])('aniq planId (%s) → 409 plan.locked', async (status) => {
    const patientId = await newPatient(`Bemor ${status}`);
    const planId = await insertPlan(patientId, status);
    const res = await record({ patientId, planId, items: [filling16()] });
    expect(res.status).toBe(409);
    expect(await errCode(res)).toBe('plan.locked');
    expect((await planStages(planId)).length).toBe(0);
  });

  test('boshqa bemorning rejasi → 400 ownership.mismatch', async () => {
    const p1 = await newPatient('Bemor E1');
    const p2 = await newPatient('Bemor E2');
    const planId = await insertPlan(p2, 'in_progress');
    const res = await record({ patientId: p1, planId, items: [filling16()] });
    expect(res.status).toBe(400);
    expect(await errCode(res)).toBe('ownership.mismatch');
    expect((await planStages(planId)).length).toBe(0);
  });

  test('ikkinchi xizmat noto‘g‘ri serviceId → 400, reja ham, bosqich ham yaratilmaydi', async () => {
    const patientId = await newPatient('Bemor F');
    const res = await record({
      patientId,
      items: [filling16(), { serviceId: crypto.randomUUID(), serviceName: 'Soxta', cost: 1 }],
    });
    expect(res.status).toBe(400);
    expect(await errCode(res)).toMatch(/^ownership\./);
    expect((await patientPlans(patientId)).length).toBe(0);
  });

  test('yaroqsiz FDI → 400; bo‘sh items → 400', async () => {
    const patientId = await newPatient('Bemor G');
    let res = await record({ patientId, items: [{ ...filling16(), toothNumbers: [19] }] });
    expect(res.status).toBe(400);
    res = await record({ patientId, items: [] });
    expect(res.status).toBe(400);
  });
});

describe('FT-01.2 — vizit yozuviga bog‘lash (visitNoteId)', () => {
  test('qoralama vizit → note.stageId = yangi bosqich; imzo idempotent (ikkinchi snapshot yo‘q)', async () => {
    const patientId = await newPatient('Bemor V1');
    const noteId = await insertVisitNote(patientId, { performedServices: [] });
    const res = await record({ patientId, visitNoteId: noteId, items: [filling16()] });
    expect(res.status).toBe(201);
    const dto = ((await res.json()) as { data: CompletedWorkDto }).data;
    const stage = dto.stages[0]!;
    expect(stage.status).toBe('completed');
    expect((await readVisitNote(noteId)).stageId).toBe(stage.id);

    const charts = await countCharts(patientId);
    const sign = await call(tokens.doctor as string, 'POST', `/visit-notes/${noteId}/sign`);
    expect(sign.status).toBe(200);
    expect(await countCharts(patientId)).toBe(charts);
    const rc = await inTenant((tx) =>
      tx.select().from(recalls).where(eq(recalls.sourceStageId, stage.id)),
    );
    expect(rc.length).toBe(1);
  });

  test('vizit shu xizmat BOM’ini allaqachon yechgan bo‘lsa — bosqich qayta yechmaydi (dedup)', async () => {
    const patientId = await newPatient('Bemor V2');
    const noteId = await insertVisitNote(patientId, { performedServices: [serviceId] });
    await inTenant((tx) =>
      tx.insert(stockMovements).values({
        tenantId,
        itemId: stockItemId,
        type: 'out',
        quantity: '2',
        reason: 'visit_auto',
        sourceVisitNoteId: noteId,
        sourceServiceId: serviceId,
      }),
    );
    const res = await record({ patientId, visitNoteId: noteId, items: [filling16()] });
    expect(res.status).toBe(201);
    const stage = ((await res.json()) as { data: CompletedWorkDto }).data.stages[0]!;
    const mv = await inTenant((tx) =>
      tx.select().from(stockMovements).where(eq(stockMovements.sourceStageId, stage.id)),
    );
    expect(mv.length).toBe(0);
  });

  test('imzolangan vizit → 409 visit_note.signed, reja/bosqich yaratilmaydi', async () => {
    const patientId = await newPatient('Bemor V3');
    const noteId = await insertVisitNote(patientId, { signedAt: new Date() });
    const res = await record({ patientId, visitNoteId: noteId, items: [filling16()] });
    expect(res.status).toBe(409);
    expect(await errCode(res)).toBe('visit_note.signed');
    expect((await patientPlans(patientId)).length).toBe(0);
  });

  test('vizit allaqachon bosqichga bog‘langan → 409 visit_note.stage_linked', async () => {
    const patientId = await newPatient('Bemor V4');
    const first = await insertVisitNote(patientId);
    const ok1 = await record({ patientId, visitNoteId: first, items: [filling16()] });
    expect(ok1.status).toBe(201);
    const res = await record({
      patientId,
      visitNoteId: first,
      items: [{ serviceName: 'Tozalash', cost: 1000 }],
    });
    expect(res.status).toBe(409);
    expect(await errCode(res)).toBe('visit_note.stage_linked');
    const [plan] = await patientPlans(patientId);
    expect((await planStages(plan!.id)).length).toBe(1);
  });

  test('vizit bilan bir nechta xizmat → 400 (vizit bitta bosqichga bog‘lanadi)', async () => {
    const patientId = await newPatient('Bemor V5');
    const noteId = await insertVisitNote(patientId);
    const res = await record({
      patientId,
      visitNoteId: noteId,
      items: [filling16(), { serviceName: 'Tozalash', cost: 1000 }],
    });
    expect(res.status).toBe(400);
    expect((await patientPlans(patientId)).length).toBe(0);
  });

  test('boshqa bemorning vizit yozuvi → 400 ownership.mismatch', async () => {
    const p1 = await newPatient('Bemor V6a');
    const p2 = await newPatient('Bemor V6b');
    const noteId = await insertVisitNote(p2);
    const res = await record({ patientId: p1, visitNoteId: noteId, items: [filling16()] });
    expect(res.status).toBe(400);
    expect(await errCode(res)).toBe('ownership.mismatch');
    expect((await readVisitNote(noteId)).stageId).toBeNull();
  });
});
