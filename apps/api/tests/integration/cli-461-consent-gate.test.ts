/**
 * CLI-461 — treatment-plan accept gate haqiqiy consent-formga bog'lash, REAL DB.
 *
 * Muammo: `treatment_plans.consentSignedAt`/`consentSignatureUrl` — bo'sh timestamp +
 * ixtiyoriy URL, `consent_forms` modulidan (shablon-snapshot) MUSTAQIL. `POST
 * /treatment-plans/{id}/consent` bo'sh `{}` bilan chaqirilsa ham plan "accepted"ga
 * o'tardi — muddat/haqiqiylik tekshiruvi umuman yo'q edi.
 *
 * Fix: `consent_forms`ga `expiresAt`/`isPerpetual` qo'shildi; treatment-plan consent
 * endi HAQIQIY, amaldagi (isPerpetual=true YOKI expiresAt>now) `consent_forms` yozuvi
 * ID'siga ("to'liq bog'lash" — `treatment_plans.consentFormId` FK) tayanadi.
 *   - `setConsent(planId, { consentFormId })` — form mavjud+shu bemor+type='treatment'+
 *     amaldagi bo'lmasa `ConsentInvalidError` (400 `plan.consent_invalid`).
 *   - `updatePlan(planId, { status: 'accepted' })` — linklangan form yo'q YOKI endi
 *     (jonli qayta tekshiruvda) amal qilmasa `ConsentRequiredError` (400
 *     `plan.consent_required`) — bu CACHE'langan `consentSignedAt`ga emas, balki
 *     HAR SAFAR `consent_forms`ni jonli so'rashga tayanadi (muddat setConsent bilan
 *     accept orasida tugab qolishi mumkin — shu holni ham qamrab oladi).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env tests/integration/cli-461-consent-gate.test.ts`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { consentForms, patients, tenants, treatmentPlans, users } from '@dental/db-schema';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import { createAuditLogger } from '../../src/lib/audit-logger.ts';
import { consentSchema } from '../../src/modules/clinical/treatment-plans/treatment-plans.schema.ts';
import {
  ConsentInvalidError,
  ConsentRequiredError,
  createTreatmentPlansService,
} from '../../src/modules/clinical/treatment-plans/treatment-plans.service.ts';

const audit = createAuditLogger({ db });
const plansService = createTreatmentPlansService({ audit });

let tenantId: string;
let ownerId: string;
let patientId: string;
let otherPatientId: string;

let formValidPerpetual: string;
let formValidExpiryFuture: string;
let formExpired: string;
let formNoExpiryNotPerpetual: string;
let formWrongPatient: string;
let formWrongType: string;

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

/** Har test o'z (commit qilinadigan) presented-status planini yaratadi. */
async function createPresentedPlan(): Promise<string> {
  return db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [plan] = await tx
      .insert(treatmentPlans)
      .values({
        tenantId,
        patientId,
        doctorId: ownerId,
        title: 'Plan 461',
        status: 'presented',
      })
      .returning({ id: treatmentPlans.id });
    if (!plan) throw new Error('plan insert failed');
    return plan.id;
  });
}

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000461', passwordHash: 'x', fullName: 'Owner 461' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI-461 Clinic', slug: 'cli-461-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));

    const [p] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Bemor 461' })
      .returning({ id: patients.id });
    if (!p) throw new Error('patient insert failed');
    patientId = p.id;

    const [p2] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Boshqa bemor 461' })
      .returning({ id: patients.id });
    if (!p2) throw new Error('other patient insert failed');
    otherPatientId = p2.id;

    const dayMs = 24 * 60 * 60 * 1000;
    const commonForm = {
      tenantId,
      patientId,
      type: 'treatment' as const,
      title: 'Davolashga rozilik',
      bodyText: 'Matn...',
      language: 'uz',
      signedByUserId: ownerId,
    };

    const [perpetual] = await tx
      .insert(consentForms)
      .values({ ...commonForm, isPerpetual: true, expiresAt: null })
      .returning({ id: consentForms.id });
    formValidPerpetual = perpetual!.id;

    const [futureExpiry] = await tx
      .insert(consentForms)
      .values({
        ...commonForm,
        isPerpetual: false,
        expiresAt: new Date(Date.now() + 30 * dayMs),
      })
      .returning({ id: consentForms.id });
    formValidExpiryFuture = futureExpiry!.id;

    const [expired] = await tx
      .insert(consentForms)
      .values({
        ...commonForm,
        isPerpetual: false,
        expiresAt: new Date(Date.now() - 1 * dayMs),
      })
      .returning({ id: consentForms.id });
    formExpired = expired!.id;

    const [noExpiry] = await tx
      .insert(consentForms)
      .values({ ...commonForm, isPerpetual: false, expiresAt: null })
      .returning({ id: consentForms.id });
    formNoExpiryNotPerpetual = noExpiry!.id;

    const [wrongPatient] = await tx
      .insert(consentForms)
      .values({ ...commonForm, patientId: otherPatientId, isPerpetual: true, expiresAt: null })
      .returning({ id: consentForms.id });
    formWrongPatient = wrongPatient!.id;

    const [wrongType] = await tx
      .insert(consentForms)
      .values({ ...commonForm, type: 'anesthesia', isPerpetual: true, expiresAt: null })
      .returning({ id: consentForms.id });
    formWrongType = wrongType!.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

describe("CLI-461 — schema: bo'sh body rad etiladi", () => {
  test('consentSchema.safeParse({}) → invalid (consentFormId required)', () => {
    const result = consentSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('CLI-461 — setConsent: faqat haqiqiy, amaldagi consent-formni qabul qiladi', () => {
  test("mavjud bo'lmagan consentFormId → ConsentInvalidError", async () => {
    const planId = await createPresentedPlan();
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return plansService.setConsent(ctx(tx), planId, {
          consentFormId: '00000000-0000-0000-0000-000000000000',
        });
      }),
    ).rejects.toBeInstanceOf(ConsentInvalidError);
  });

  test('boshqa bemorga tegishli consent-form → ConsentInvalidError', async () => {
    const planId = await createPresentedPlan();
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return plansService.setConsent(ctx(tx), planId, { consentFormId: formWrongPatient });
      }),
    ).rejects.toBeInstanceOf(ConsentInvalidError);
  });

  test("noto'g'ri turdagi consent (anesthesia, treatment kerak) → ConsentInvalidError", async () => {
    const planId = await createPresentedPlan();
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return plansService.setConsent(ctx(tx), planId, { consentFormId: formWrongType });
      }),
    ).rejects.toBeInstanceOf(ConsentInvalidError);
  });

  test("muddati o'tgan consent → ConsentInvalidError", async () => {
    const planId = await createPresentedPlan();
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return plansService.setConsent(ctx(tx), planId, { consentFormId: formExpired });
      }),
    ).rejects.toBeInstanceOf(ConsentInvalidError);
  });

  test("muddatsiz DEB BELGILANMAGAN + expiresAt yo'q (default) → ConsentInvalidError", async () => {
    const planId = await createPresentedPlan();
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return plansService.setConsent(ctx(tx), planId, {
          consentFormId: formNoExpiryNotPerpetual,
        });
      }),
    ).rejects.toBeInstanceOf(ConsentInvalidError);
  });

  test('isPerpetual=true amaldagi consent → OK, plan.consentFormId + consentSignedAt saqlanadi', async () => {
    const planId = await createPresentedPlan();
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return plansService.setConsent(ctx(tx), planId, { consentFormId: formValidPerpetual });
    });
    expect(updated?.consentFormId).toBe(formValidPerpetual);
    expect(updated?.consentSignedAt).not.toBeNull();
  });

  test('kelajakdagi expiresAt bilan amaldagi consent → OK', async () => {
    const planId = await createPresentedPlan();
    const updated = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return plansService.setConsent(ctx(tx), planId, { consentFormId: formValidExpiryFuture });
    });
    expect(updated?.consentFormId).toBe(formValidExpiryFuture);
  });
});

describe('CLI-461 — accept gate (presented→accepted): jonli qayta tekshiradi', () => {
  test('hech qanday consent linklanmagan → ConsentRequiredError', async () => {
    const planId = await createPresentedPlan();
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        return plansService.updatePlan(ctx(tx), planId, { status: 'accepted' });
      }),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
  });

  test('amaldagi (isPerpetual) consent linklangan → accept OK', async () => {
    const planId = await createPresentedPlan();
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      await plansService.setConsent(ctx(tx), planId, { consentFormId: formValidPerpetual });
    });
    const accepted = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      return plansService.updatePlan(ctx(tx), planId, { status: 'accepted' });
    });
    expect(accepted?.status).toBe('accepted');
  });

  test(
    "linklangan consent setConsent'dan KEYIN, accept'dan OLDIN muddati tugasa → " +
      'ConsentRequiredError (cache emas, jonli tekshiruv)',
    async () => {
      const planId = await createPresentedPlan();
      // Avval amaldagi (kelajakdagi expiresAt) consent bilan linklaymiz — setConsent OK.
      await db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        await plansService.setConsent(ctx(tx), planId, { consentFormId: formValidExpiryFuture });
      });
      // Endi consent-form muddatini o'tmishga o'tkazamiz (real-world: kutish o'rniga
      // to'g'ridan yozuvni tahrirlab simulyatsiya qilamiz).
      await db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        await tx
          .update(consentForms)
          .set({ expiresAt: new Date(Date.now() - 1000) })
          .where(eq(consentForms.id, formValidExpiryFuture));
      });
      // Accept endi RAD etilishi kerak — gate cache'langan consentSignedAt'ga emas,
      // consent_forms'ni jonli qayta so'raydi.
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
          return plansService.updatePlan(ctx(tx), planId, { status: 'accepted' });
        }),
      ).rejects.toBeInstanceOf(ConsentRequiredError);

      // Formani asl holatiga qaytaramiz (boshqa testlarga ta'sir qilmasligi uchun).
      await db.transaction(async (tx) => {
        await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
        await tx
          .update(consentForms)
          .set({ expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
          .where(eq(consentForms.id, formValidExpiryFuture));
      });
    },
  );
});
