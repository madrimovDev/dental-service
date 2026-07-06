/**
 * Epic B (Recall / Revisit) integratsiya testlari — real DB + RLS.
 * B3 (CRUD), B4 (auto-create + idempotentlik), B5 (rebook-close).
 *
 * Bitta faylni ALOHIDA ishlating (TRUNCATE race — to'liq parallel suite emas):
 *   cd apps/api && bun test tests/integration/recalls.test.ts --env-file=../../.env
 */
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  branches,
  patients,
  recalls,
  tenants,
  treatmentPlans,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAppointmentsService } from '../../src/modules/appointments/appointments.service.ts';
import { createTreatmentPlansService } from '../../src/modules/clinical/treatment-plans/treatment-plans.service.ts';
import { createRecallsService } from '../../src/modules/recalls/recalls.service.ts';

let tenantId: string;
let ownerId: string;
let patientId: string;
let branchId: string;

const ctx = (tx: DbOrTx, tId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tId
          : k === 'user'
            ? { id: ownerId }
            : k === 'accessClaims'
              ? { perms: ['@owner'] }
              : undefined,
  }) as unknown as Context;

const run = <T>(tId: string, fn: (c: Context) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tId}'`));
    return fn(ctx(tx, tId));
  });

const noopAudit = { record: async () => {} };
const svc = createRecallsService({ audit: noopAudit });

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000090', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  ownerId = owner!.id;
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'R', slug: 'r-recall', ownerUserId: ownerId, defaultLanguage: 'uz' })
    .returning({ id: tenants.id });
  tenantId = tenant!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [b] = await tx
      .insert(branches)
      .values({ tenantId, name: 'B' })
      .returning({ id: branches.id });
    branchId = b!.id;
    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Ali Valiyev', phone: '+998901112233' })
      .returning({ id: patients.id });
    patientId = p!.id;
  });
});

const clearRecalls = () =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    await tx.delete(recalls);
  });

describe('B3 recalls CRUD', () => {
  beforeEach(clearRecalls);

  test('create → list (dashboard) → patient join (name/phone)', async () => {
    const created = await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'manual', dueDate: '2026-06-01' }),
    );
    expect(created).not.toBeNull();
    expect(created!.status).toBe('pending');
    expect(created!.source).toBe('manual');
    expect(created!.patientName).toBe('Ali Valiyev');
    expect(created!.patientPhone).toBe('+998901112233');

    // Dashboard default — pending + due <= date.
    const list = await run(tenantId, (c) => svc.list(c, { date: '2026-06-21' }));
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(created!.id);
  });

  test('list status filter — contacted excluded by default pending filter', async () => {
    await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'manual', dueDate: '2026-06-01' }),
    );
    const created = await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'preventive', dueDate: '2026-06-02' }),
    );
    await run(tenantId, (c) => svc.markContacted(c, created!.id, {}));

    const pendingOnly = await run(tenantId, (c) => svc.list(c, { date: '2026-06-21' }));
    expect(pendingOnly.length).toBe(1);
    const contactedOnly = await run(tenantId, (c) =>
      svc.list(c, { date: '2026-06-21', status: 'contacted' }),
    );
    expect(contactedOnly.length).toBe(1);
    expect(contactedOnly[0]!.id).toBe(created!.id);
  });

  test('markContacted → status=contacted, attempts++ , lastContactedAt set', async () => {
    const created = await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'manual', dueDate: '2026-06-01' }),
    );
    const r = await run(tenantId, (c) =>
      svc.markContacted(c, created!.id, { notes: 'qo‘ng‘iroq' }),
    );
    expect(r!.status).toBe('contacted');
    expect(r!.contactAttempts).toBe(1);
    expect(r!.lastContactedAt).not.toBeNull();
    expect(r!.notes).toBe('qo‘ng‘iroq');
  });

  test('update status=scheduled → closedBy/closedAt set, scheduledAppointmentId stored', async () => {
    const created = await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'manual', dueDate: '2026-06-01' }),
    );
    const apptId = crypto.randomUUID();
    const r = await run(tenantId, (c) =>
      svc.update(c, created!.id, { status: 'scheduled', scheduledAppointmentId: apptId }),
    );
    expect(r!.status).toBe('scheduled');
    expect(r!.scheduledAppointmentId).toBe(apptId);
    expect(r!.closedBy).toBe(ownerId);
    expect(r!.closedAt).not.toBeNull();
  });

  test('listByPatient returns all statuses', async () => {
    const a = await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'manual', dueDate: '2026-06-01' }),
    );
    await run(tenantId, (c) => svc.update(c, a!.id, { status: 'dismissed' }));
    await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'preventive', dueDate: '2026-07-01' }),
    );
    const all = await run(tenantId, (c) => svc.listByPatient(c, patientId));
    expect(all.length).toBe(2);
  });

  test('getById of missing → null', async () => {
    const r = await run(tenantId, (c) => svc.getById(c, crypto.randomUUID()));
    expect(r).toBeNull();
  });
});

describe('B4 auto-create triggers', () => {
  beforeEach(clearRecalls);

  test('autoCreateFromStage → exactly one (idempotent on repeat — partial unique index)', async () => {
    const stageId = crypto.randomUUID();
    await run(tenantId, (c) => svc.autoCreateFromStage(c, { patientId, sourceStageId: stageId }));
    // Takror chaqiruv — onConflictDoNothing → ikkinchi yozuv YO'Q.
    await run(tenantId, (c) => svc.autoCreateFromStage(c, { patientId, sourceStageId: stageId }));

    const all = await run(tenantId, (c) => svc.listByPatient(c, patientId));
    const followups = all.filter((r) => r.sourceStageId === stageId);
    expect(followups.length).toBe(1);
    expect(followups[0]!.reason).toBe('treatment_followup');
    expect(followups[0]!.source).toBe('treatment_stage');
    expect(followups[0]!.intervalMonths).toBe(6);
    // dueDate ~ today + 6 months (yil/oy mavjud).
    expect(followups[0]!.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('different stages → distinct recalls (no false dedupe)', async () => {
    await run(tenantId, (c) =>
      svc.autoCreateFromStage(c, { patientId, sourceStageId: crypto.randomUUID() }),
    );
    await run(tenantId, (c) =>
      svc.autoCreateFromStage(c, { patientId, sourceStageId: crypto.randomUUID() }),
    );
    const all = await run(tenantId, (c) => svc.listByPatient(c, patientId));
    expect(all.filter((r) => r.reason === 'treatment_followup').length).toBe(2);
  });

  test('autoCreatePreventive → one open preventive per patient (service open-check dedupe)', async () => {
    await run(tenantId, (c) => svc.autoCreatePreventive(c, { patientId }));
    // Takror — ochiq preventive bor → skip.
    await run(tenantId, (c) => svc.autoCreatePreventive(c, { patientId }));
    const all = await run(tenantId, (c) => svc.listByPatient(c, patientId));
    const prev = all.filter((r) => r.reason === 'preventive');
    expect(prev.length).toBe(1);
    expect(prev[0]!.source).toBe('appointment');
  });

  test('autoCreatePreventive after previous closed → new one allowed', async () => {
    const first = await run(tenantId, (c) => svc.autoCreatePreventive(c, { patientId }));
    const all1 = await run(tenantId, (c) => svc.listByPatient(c, patientId));
    const openId = all1.find((r) => r.reason === 'preventive')!.id;
    // Yopamiz (completed) → endi ochiq preventive yo'q.
    await run(tenantId, (c) => svc.update(c, openId, { status: 'completed' }));
    await run(tenantId, (c) => svc.autoCreatePreventive(c, { patientId }));
    const all2 = await run(tenantId, (c) => svc.listByPatient(c, patientId));
    expect(all2.filter((r) => r.reason === 'preventive').length).toBe(2);
    expect(first).toBeUndefined(); // void return
  });
});

describe('B5 rebook linkage (closeOpenOnRebook)', () => {
  beforeEach(clearRecalls);

  test('open recalls → scheduled + scheduledAppointmentId on rebook', async () => {
    await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'manual', dueDate: '2026-06-01' }),
    );
    await run(tenantId, (c) =>
      svc.autoCreateFromStage(c, { patientId, sourceStageId: crypto.randomUUID() }),
    );
    const apptId = crypto.randomUUID();
    // CLI-426: relevance-filter uchun appointmentStart kerak. Ikkinchi recall
    // (autoCreateFromStage) dueDate'i tenant_settings.defaultRecallIntervalMonths
    // (default 6 oy)dan real `new Date()` asosida hisoblanadi — testda oldindan
    // aniq bo'lmagan qiymat. Ikkala recall ham "relevant" bo'lishi uchun
    // appointmentStart'ni ancha kelajakka (400 kun) qo'yamiz — bu ikkala dueDate
    // − 30 kun chegarasidan ham katta bo'ladi (isRebookRelevant true).
    const farFutureStart = new Date(Date.now() + 400 * 24 * 3600 * 1000);
    await run(tenantId, (c) => svc.closeOpenOnRebook(c, patientId, apptId, farFutureStart));

    const all = await run(tenantId, (c) => svc.listByPatient(c, patientId));
    expect(all.length).toBe(2);
    for (const r of all) {
      expect(r.status).toBe('scheduled');
      expect(r.scheduledAppointmentId).toBe(apptId);
      expect(r.closedBy).toBe(ownerId);
    }
  });

  test('no open recalls → no-op (does not throw)', async () => {
    await run(tenantId, (c) =>
      svc.closeOpenOnRebook(c, patientId, crypto.randomUUID(), new Date('2026-06-01T09:00:00Z')),
    );
    const all = await run(tenantId, (c) => svc.listByPatient(c, patientId));
    expect(all.length).toBe(0);
  });

  test('already-scheduled recall not touched (only pending/contacted closed)', async () => {
    const r = await run(tenantId, (c) =>
      svc.create(c, { patientId, reason: 'manual', dueDate: '2026-06-01' }),
    );
    await run(tenantId, (c) => svc.update(c, r!.id, { status: 'dismissed' }));
    await run(tenantId, (c) =>
      svc.closeOpenOnRebook(c, patientId, crypto.randomUUID(), new Date('2026-06-01T09:00:00Z')),
    );
    const after = await run(tenantId, (c) => svc.getById(c, r!.id));
    expect(after!.status).toBe('dismissed');
  });
});

// End-to-end trigger wiring — recall hook injected into the REAL appointment /
// treatment-plan services (transition guard + findPlan lookup that hook-only
// tests can't exercise).
describe('B4/B5 trigger wiring (through real services)', () => {
  const apptSvc = createAppointmentsService({ audit: noopAudit, recall: svc });
  const tpSvc = createTreatmentPlansService({ audit: noopAudit, recall: svc });

  beforeEach(clearRecalls);

  test('appointment update status→completed → preventive recall (transition guard)', async () => {
    const future = new Date(Date.now() + 100 * 3600_000);
    const created = await run(tenantId, (c) =>
      apptSvc.create(c, {
        branchId,
        patientId,
        doctorId: ownerId,
        startTime: future.toISOString(),
        endTime: new Date(future.getTime() + 3600_000).toISOString(),
        serviceIds: [],
      }),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const apptId = created.appointment.id;

    // CLI-409: scheduled→completed bevosita taqiqlangan — avval in_progress'ga.
    await run(tenantId, (c) => apptSvc.update(c, apptId, { status: 'in_progress' }));
    await run(tenantId, (c) => apptSvc.update(c, apptId, { status: 'completed' }));
    let prev = await run(tenantId, (c) => svc.listByPatient(c, patientId));
    expect(prev.filter((r) => r.reason === 'preventive').length).toBe(1);

    // Re-PATCH completed→completed → transition guard: NO duplicate. Faqat
    // status (boshqa maydon YO'Q) — CLI-409 terminal-guard completed'da
    // boshqa maydon (notes/vaqt/doctor) tegilsa status.terminal otadi;
    // status-only completed→completed idempotent no-op sifatida o'tadi.
    await run(tenantId, (c) => apptSvc.update(c, apptId, { status: 'completed' }));
    prev = await run(tenantId, (c) => svc.listByPatient(c, patientId));
    expect(prev.filter((r) => r.reason === 'preventive').length).toBe(1);
  });

  test('stage update status→completed → treatment_followup recall (findPlan lookup, idempotent)', async () => {
    // Plan + stage seed (RLS context).
    const stageId = await run(tenantId, async (c) => {
      const tx = c.get('db') as DbOrTx;
      // CLI-415: stage completion parent plan 'accepted'/'in_progress' bo'lishini
      // talab qiladi (draft'da RAD) — bu test recall-hook'ni tekshiradi, plan
      // status draft default bilan avvalgi assertion o'rniga to'g'ridan accepted.
      const [plan] = await tx
        .insert(treatmentPlans)
        .values({
          tenantId,
          patientId,
          doctorId: ownerId,
          title: 'Plan',
          totalCost: '0',
          status: 'accepted',
        })
        .returning({ id: treatmentPlans.id });
      const [stage] = await tx
        .insert(treatmentStages)
        .values({
          treatmentPlanId: plan!.id,
          sequence: 1,
          serviceName: 'Plomba',
          cost: '100',
        })
        .returning({ id: treatmentStages.id });
      return stage!.id;
    });

    await run(tenantId, (c) => tpSvc.updateStage(c, stageId, { status: 'completed' }));
    let fu = await run(tenantId, (c) => svc.listByPatient(c, patientId));
    const followups = fu.filter((r) => r.reason === 'treatment_followup');
    expect(followups.length).toBe(1);
    expect(followups[0]!.sourceStageId).toBe(stageId);

    // Re-complete same stage → idempotent (partial unique index): still 1.
    await run(tenantId, (c) => tpSvc.updateStage(c, stageId, { status: 'completed' }));
    fu = await run(tenantId, (c) => svc.listByPatient(c, patientId));
    expect(fu.filter((r) => r.reason === 'treatment_followup').length).toBe(1);

    // Verify the stage itself is completed (sanity).
    const stageRow = await run(tenantId, (c) =>
      (c.get('db') as DbOrTx)
        .select({ status: treatmentStages.status })
        .from(treatmentStages)
        .where(eq(treatmentStages.id, stageId)),
    );
    expect(stageRow[0]!.status).toBe('completed');
  });
});
