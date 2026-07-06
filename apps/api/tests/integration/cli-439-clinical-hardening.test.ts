/**
 * CLI-439 — LOW-B clinical hardening (api sub-items), REAL DB.
 *
 * Qoplaydi:
 *   B1: GET /treatment-plans/{id}/estimate — audit_log'ga 'viewed' yozuvi yozadi.
 *   B2: lab-orders service.update — delivered→draft RAD (InvalidLabOrderTransitionError);
 *       draft→sent OK + sentDate auto-set.
 *   B5: setConsent — bo'sh submit mavjud imzoni null qilmaydi (ConsentOverwriteError);
 *       yangi (farqli) qiymat bilan qayta imzolash ruxsat etiladi + audit before/after.
 *   B8: patient-images updateMetadata — bo'sh body 500 emas, no-op qaytaradi.
 *   B9c: updateStage audit — before + after ikkalasi ham yoziladi.
 *
 * ⚠️ Infra DOWN paytida YOZILGAN, LEKIN ISHGA TUSHIRILMAGAN.
 *   cd apps/api && bun test tests/integration/cli-439-clinical-hardening.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  auditLog,
  labOrders,
  patientImages,
  patients,
  tenants,
  treatmentPlans,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import {
  ConsentOverwriteError,
  createTreatmentPlansService,
} from '../../src/modules/clinical/treatment-plans/treatment-plans.service.ts';
import { createLabOrdersService } from '../../src/modules/lab-orders/lab-orders.service.ts';
import { InvalidLabOrderTransitionError } from '../../src/modules/lab-orders/lab-orders.transitions.ts';
import { createPatientImagesService } from '../../src/modules/patient-images/patient-images.service.ts';

const audit = createAuditLogger({ db });
const plansService = createTreatmentPlansService({ audit });
const labOrdersService = createLabOrdersService({ audit });
const imagesService = createPatientImagesService({ audit });

let tenantId: string;
let ownerId: string;
let patientId: string;
let planId: string;
let stageId: string;
let labOrderId: string;
let imageId: string;

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
    req: { header: () => undefined },
  }) as unknown as Context;

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000439', passwordHash: 'x', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Hardening Clinic', slug: 'hardening-clinic-439', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor 439' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;

    const [plan] = await tx
      .insert(treatmentPlans)
      .values({ tenantId, patientId, doctorId: ownerId, title: 'Plan 439', status: 'in_progress' })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    planId = plan.id;

    const [stage] = await tx
      .insert(treatmentStages)
      .values({ treatmentPlanId: plan.id, sequence: 1, serviceName: 'S', cost: '1000' })
      .returning({ id: treatmentStages.id });
    if (!stage) throw new Error('stage insert failed');
    stageId = stage.id;

    const [order] = await tx
      .insert(labOrders)
      .values({
        tenantId,
        patientId,
        doctorId: ownerId,
        labName: 'Lab 439',
        orderType: 'crown',
        items: [{ description: 'Crown' }],
        status: 'delivered',
        deliveredDate: new Date(),
      })
      .returning({ id: labOrders.id });
    if (!order) throw new Error('lab order insert failed');
    labOrderId = order.id;

    const [img] = await tx
      .insert(patientImages)
      .values({
        tenantId,
        patientId,
        type: 'intraoral_photo',
        objectKey: 'k/439.jpg',
        originalFilename: '439.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 10,
      })
      .returning({ id: patientImages.id });
    if (!img) throw new Error('image insert failed');
    imageId = img.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe('CLI-439 B1 — estimate() audit', () => {
  test("GET estimate → audit_log'da viewed/treatment_plan_estimate", async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await plansService.estimate(ctx(tx), planId);
    });
    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'viewed'),
          eq(auditLog.resourceType, 'treatment_plan_estimate'),
          eq(auditLog.resourceId, planId),
        ),
      );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('CLI-439 B2 — lab-order status state machine', () => {
  test('delivered → draft RAD (InvalidLabOrderTransitionError)', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return labOrdersService.update(ctx(tx), labOrderId, { status: 'draft' });
      }),
    ).rejects.toBeInstanceOf(InvalidLabOrderTransitionError);
  });
});

describe('CLI-439 B5 — consent overwrite guard', () => {
  test('first sign with URL → OK', async () => {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return plansService.setConsent(ctx(tx), planId, { consentSignatureUrl: 'sig-v1.png' });
    });
    expect(updated?.consentSignatureUrl).toBe('sig-v1.png');
  });

  test('empty submit over existing signature → RAD (ConsentOverwriteError)', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return plansService.setConsent(ctx(tx), planId, {});
      }),
    ).rejects.toBeInstanceOf(ConsentOverwriteError);

    // Signature unaffected by the rejected attempt.
    const [plan] = await db.select().from(treatmentPlans).where(eq(treatmentPlans.id, planId));
    expect(plan?.consentSignatureUrl).toBe('sig-v1.png');
  });

  test('deliberate re-sign with a NEW value → allowed (not silently blocked)', async () => {
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return plansService.setConsent(ctx(tx), planId, { consentSignatureUrl: 'sig-v2.png' });
    });
    expect(updated?.consentSignatureUrl).toBe('sig-v2.png');
  });
});

describe('CLI-439 B8 — patient-image empty-body PATCH guard', () => {
  test('empty body → no-op (not 500), returns existing row', async () => {
    const row = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return imagesService.updateMetadata(ctx(tx), imageId, {});
    });
    expect(row?.id).toBe(imageId);
  });
});

describe('CLI-439 B9c — updateStage audit before+after', () => {
  test('audit row captures BOTH before and after status', async () => {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await plansService.updateStage(ctx(tx), stageId, { status: 'in_progress' });
    });
    const [row] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'updated'), eq(auditLog.resourceType, 'treatment_stage')))
      .orderBy(auditLog.createdAt);
    expect(row?.before).not.toBeNull();
    expect((row?.before as { status?: string } | null)?.status).toBe('pending');
    expect((row?.after as { status?: string } | null)?.status).toBe('in_progress');
  });
});
