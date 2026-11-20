/**
 * FT-01.5 (spec §3) — soddalashtirilgan holatlar: «Bemor rozi» (accepted) reja birinchi
 * bosqich boshlanganda (yoki darhol bajarilganda) AVTOMATIK «Davolanmoqda» (in_progress)
 * ga o'tadi — alohida «Ijroni boshlash» qadami shart emas. REAL DB.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  branches,
  patients,
  tenants,
  treatmentPlans,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createTreatmentPlansService } from '../../src/modules/clinical/treatment-plans/treatment-plans.service.ts';

type AuditEntry = { action: string; resourceType: string; before?: unknown; after?: unknown };
const auditEntries: AuditEntry[] = [];
const audit = {
  record: async (_c: Context, e: AuditEntry) => {
    auditEntries.push(e);
  },
} as unknown as AuditLogger;
const plansService = createTreatmentPlansService({ audit });

const ctx = (tx: DbOrTx, tenantId: string): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'activeTenantId'
          ? tenantId
          : k === 'user'
            ? { id: undefined }
            : undefined,
  }) as unknown as Context;

let tenantId: string;
const inTenant = <T>(fn: (tx: DbOrTx) => Promise<T>) =>
  db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    return fn(tx);
  });

type PlanStatusT = 'draft' | 'presented' | 'accepted' | 'in_progress';
const ids: Record<string, string> = {};

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000515', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner');
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'FT015 Clinic', slug: 'ft015-clinic', ownerUserId: owner.id })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant');
  tenantId = tenant.id;

  await inTenant(async (tx) => {
    await tx.insert(branches).values({ tenantId, name: 'B1' });
    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient');
    const mk = async (key: string, status: PlanStatusT) => {
      const [plan] = await tx
        .insert(treatmentPlans)
        .values({ tenantId, patientId: patient.id, doctorId: owner.id, title: key, status })
        .returning({ id: treatmentPlans.id });
      if (!plan) throw new Error('plan');
      const [s] = await tx
        .insert(treatmentStages)
        .values({
          treatmentPlanId: plan.id,
          sequence: 1,
          serviceName: 'S1',
          cost: '100000',
          status: 'pending',
          acceptance: 'accepted',
        })
        .returning({ id: treatmentStages.id });
      if (!s) throw new Error('stage');
      ids[`${key}Plan`] = plan.id;
      ids[`${key}Stage`] = s.id;
    };
    await mk('start', 'accepted');
    await mk('complete', 'accepted');
    await mk('visit', 'accepted');
    await mk('notes', 'accepted');
    await mk('already', 'in_progress');
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const planStatus = (id: string) =>
  inTenant(async (tx) => {
    const [p] = await tx
      .select({ status: treatmentPlans.status })
      .from(treatmentPlans)
      .where(eq(treatmentPlans.id, id));
    return p?.status;
  });

const planAudits = () =>
  auditEntries.filter((e) => e.resourceType === 'treatment_plan' && e.action === 'updated');

describe('FT-01.5 — accepted reja birinchi bosqich boshlanganda avtomatik in_progress', () => {
  test('bosqich pending → in_progress: reja accepted → in_progress (+ audit)', async () => {
    auditEntries.length = 0;
    await inTenant((tx) =>
      plansService.updateStage(ctx(tx, tenantId), ids.startStage as string, {
        status: 'in_progress',
      }),
    );
    expect(await planStatus(ids.startPlan as string)).toBe('in_progress');
    const a = planAudits();
    expect(a).toHaveLength(1);
    expect(a[0]?.before).toMatchObject({ status: 'accepted' });
    expect(a[0]?.after).toMatchObject({ status: 'in_progress', autoStarted: true });
  });

  test('bosqich darhol completed: reja accepted → in_progress', async () => {
    await inTenant((tx) =>
      plansService.completeStage(ctx(tx, tenantId), ids.completeStage as string, {
        source: 'plan',
      }),
    );
    expect(await planStatus(ids.completePlan as string)).toBe('in_progress');
  });

  test('vizit qoralamasi bosqichni boshlaydi: reja accepted → in_progress', async () => {
    await inTenant((tx) =>
      plansService.startStageForVisit(ctx(tx, tenantId), ids.visitStage as string),
    );
    expect(await planStatus(ids.visitPlan as string)).toBe('in_progress');
  });

  test("faqat izoh o'zgarishi rejani boshlamaydi", async () => {
    await inTenant((tx) =>
      plansService.updateStage(ctx(tx, tenantId), ids.notesStage as string, { notes: 'izoh' }),
    );
    expect(await planStatus(ids.notesPlan as string)).toBe('accepted');
  });

  test("in_progress reja o'zgarmaydi (qo'shimcha audit yo'q)", async () => {
    auditEntries.length = 0;
    await inTenant((tx) =>
      plansService.updateStage(ctx(tx, tenantId), ids.alreadyStage as string, {
        status: 'in_progress',
      }),
    );
    expect(await planStatus(ids.alreadyPlan as string)).toBe('in_progress');
    expect(planAudits()).toHaveLength(0);
  });
});
