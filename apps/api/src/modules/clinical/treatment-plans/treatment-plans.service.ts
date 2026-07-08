import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { createOwnershipValidator, type OwnershipValidator } from '../../../lib/ownership.ts';
// C6: C4 qarz predikatini YAGONA manbadan ishlatish (cashier billing pure fn).
import { computePlanBalance } from '../../cashier/cashier.billing.ts';
import { createTreatmentPlansRepository } from './treatment-plans.repository.ts';
import type {
  ConsentInput,
  CreateTreatmentPlanInput,
  ListPlansQuery,
  UpdateStageInput,
  UpdateTreatmentPlanInput,
} from './treatment-plans.schema.ts';
import {
  assertPlanTransition,
  assertStageAcceptanceTransition,
  assertStageMutationAllowedForPlan,
  assertStageStatusTransition,
  type StageStatus,
} from './treatment-plans.transitions.ts';

/**
 * CLI-461: berilgan consent_forms qatori shu bemor uchun, 'treatment' turida va
 * HOZIR amaldagimi (isPerpetual=true YOKI expiresAt>now) — sof funksiya (DB/Context
 * yo'q), `setConsent` VA accept-gate (`updatePlan`) ikkalasida ishlatiladi (bitta
 * qoidaning ikki joyda drift qilishining oldini oladi).
 */
function isConsentFormCurrentlyValid(
  form: { patientId: string; type: string; isPerpetual: boolean; expiresAt: Date | null } | null,
  patientId: string,
): boolean {
  if (!form) return false;
  if (form.patientId !== patientId) return false;
  if (form.type !== 'treatment') return false;
  if (form.isPerpetual) return true;
  return form.expiresAt !== null && form.expiresAt.getTime() > Date.now();
}

/**
 * Recalls modulidan inject qilinadigan narrow dep (B4, RFC-0011 §5). Bog'liqlik
 * yo'nalishi: treatment-plans → recalls (factory injection, to'g'ridan import emas).
 */
export type RecallStageHook = {
  autoCreateFromStage: (
    c: Context,
    args: {
      patientId: string;
      sourceStageId: string;
      treatmentPlanId?: string | null;
      branchId?: string | null;
    },
  ) => Promise<void>;
};

/**
 * CLI-443: narrow DI hook (recall pattern bilan bir xil) — `services.service.ts::
 * getActivePrice` shu shaklga strukturaviy mos keladi, to'g'ridan import qilinmaydi.
 * cashier.service.ts'dagi bir xil nomdagi type bilan mustaqil (har consumer o'ziga
 * kerak shaklni e'lon qiladi — recall precedenti).
 */
export type PriceLookup = {
  getActivePrice: (
    c: Context,
    serviceId: string,
    branchId: string,
  ) => Promise<{ price: string } | null>;
};

/**
 * presented→accepted uchun amaldagi (haqiqiy, muddati o'tmagan) linklangan consent
 * yo'q bo'lsa otiladi; routes 400 (`plan.consent_required`) ga aylantiradi. CLI-461:
 * gate cache'langan `consentSignedAt`ga emas, `consent_forms`ni JONLI qayta so'rashga
 * tayanadi — `setConsent` bilan accept orasida muddat tugab qolgan holatni ham qamraydi.
 */
export class ConsentRequiredError extends Error {
  constructor() {
    super('Consent required before accepting a presented plan');
    this.name = 'ConsentRequiredError';
  }
}

/**
 * CLI-461: `setConsent`ga berilgan `consentFormId` — mavjud emas, boshqa bemorga
 * tegishli, noto'g'ri turdagi (treatment plan uchun `type='treatment'` shart) yoki
 * muddati o'tgan/aniq belgilanmagan (isPerpetual=false ∧ expiresAt=null|o'tgan) bo'lsa
 * otiladi. Routes 400 (`plan.consent_invalid`) ga aylantiradi. "Mavjud emas" va
 * "boshqa bemorga tegishli" holatlarini ATAYLAB bitta xato bilan qamraydi (cross-patient
 * mavjudlikni oshkor qilmaslik uchun).
 */
export class ConsentInvalidError extends Error {
  constructor() {
    super(
      'Referenced consent form is missing, expired, of the wrong type, or does not match this patient',
    );
    this.name = 'ConsentInvalidError';
  }
}

export const createTreatmentPlansService = (deps: {
  audit: AuditLogger;
  recall?: RecallStageHook;
  /** CLI-443: bosqich narxini serverda hisoblash uchun (faqat `serviceId` bor bosqichlarga). */
  priceLookup?: PriceLookup;
  ownership?: OwnershipValidator;
}) => {
  const repo = createTreatmentPlansRepository();
  const ownership = deps.ownership ?? createOwnershipValidator();

  const listPlans = async (c: Context, query: ListPlansQuery) => {
    const result = await repo.listPlans(c, query);
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'treatment_plan',
      resourceId: query.patientId ?? null,
      after: { patientId: query.patientId ?? null, count: result.data.length },
    });
    return result;
  };

  const getPlan = async (c: Context, id: string) => {
    const plan = await repo.getPlanWithStages(c, id);
    if (plan) {
      await deps.audit.record(c, {
        action: 'viewed',
        resourceType: 'treatment_plan',
        resourceId: id,
      });
    }
    return plan;
  };

  async function createPlan(c: Context, input: CreateTreatmentPlanInput) {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    // L12 (audit 2026-07-06): cross-entity ownership — schema-validatsiyadan KEYIN,
    // narx-hisoblash/insert'dan OLDIN. patientId/doctorId shu tenantga tegishlimi
    // (cross-tenant/mavjud bo'lmagan UUID → CrossEntityError → routes 400). Avval
    // FK constraint xatosi xom 500 qaytarardi (visit-notes.service.ts CLI-421
    // pattern bilan bir xil — routes 400'ga aylantiradi).
    await ownership.assertPatientExists(c, input.patientId);
    await ownership.assertUserExists(c, input.doctorId);

    // CLI-443: serviceId bor bosqich uchun narx SERVERDA `getActivePrice` orqali
    // hisoblanadi (client'ning `cost`i e'tiborga olinmaydi) — filial JWT'dagi
    // `activeBranchId`dan aniqlanadi (plan/patient o'zi branch-scoped emas — Qaror
    // #29 — shuning uchun "joriy ish filiali" konventsiyasi ishlatiladi; frontend
    // `PlanFormModal` allaqachon shu qiymat bilan narxni oldindan ko'rsatadi).
    // serviceId'siz (custom/maxsus) bosqich yoki faol narx topilmasa — client
    // `cost`i saqlanadi (qattiq validatsiya YO'Q — bunday bosqichlar qasddan
    // narxsiz/moslashuvchan; faqat POS (CLI-443 cashier qismi) qattiq 400 beradi).
    const activeBranchId = c.get('activeBranchId');
    const resolvedStages = await Promise.all(
      input.stages.map(async (s) => {
        if (!s.serviceId || !activeBranchId || !deps.priceLookup) return s;
        const price = await deps.priceLookup.getActivePrice(c, s.serviceId, activeBranchId);
        return price ? { ...s, cost: Number(price.price) } : s;
      }),
    );

    const totalCost = resolvedStages.reduce((sum, s) => sum + s.cost, 0);
    const totalVisits = resolvedStages.reduce((sum, s) => sum + s.estimatedVisits, 0);

    const plan = await repo.insertPlanWithStages(
      c,
      tenantId,
      {
        tenantId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        title: input.title,
        totalCost: String(totalCost),
        totalVisits,
        notes: input.notes ?? null,
      },
      (planId) =>
        resolvedStages.map((s, i) => ({
          treatmentPlanId: planId,
          sequence: i + 1,
          serviceId: s.serviceId ?? null,
          serviceName: s.serviceName,
          toothNumbers: s.toothNumbers ?? null,
          estimatedVisits: s.estimatedVisits,
          estimatedDurationMinutes: s.estimatedDurationMinutes ?? null,
          cost: String(s.cost),
          notes: s.notes ?? null,
        })),
    );

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'treatment_plan',
      resourceId: plan.id,
      after: { totalCost, totalVisits, stages: input.stages.length },
    });
    return plan;
  }

  async function updatePlan(c: Context, id: string, input: UpdateTreatmentPlanInput) {
    const before = await repo.findPlan(c, id);
    if (!before) return null;

    // C2 guard: plan status o'tishi (draft→presented→accepted→in_progress→completed/cancelled).
    if (input.status && input.status !== before.status) {
      assertPlanTransition(before.status, input.status);
      // C3/CLI-461: presented→accepted KONSENT talab qiladi — linklangan
      // `consentFormId` yo'q BO'LSA yoki (JONLI qayta so'ralganda) endi amaldagi
      // bo'lmasa RAD. Cache'langan `consentSignedAt` EMAS — `setConsent`dan keyin,
      // accept'dan oldin muddat tugashi mumkin (real-time re-validation).
      if (input.status === 'accepted') {
        const linkedForm = before.consentFormId
          ? await repo.findConsentForm(c, before.consentFormId)
          : null;
        if (!isConsentFormCurrentlyValid(linkedForm, before.patientId)) {
          throw new ConsentRequiredError();
        }
      }
    }

    const updated = await repo.updatePlan(c, id, input);
    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'treatment_plan',
        resourceId: id,
        before,
        after: updated,
      });
    }
    return updated;
  }

  /**
   * CLI-461: reja konsentini HAQIQIY, oldindan imzolangan `consent_forms` yozuviga
   * ("to'liq bog'lash") bog'laydi — bo'sh/mazmunsiz payload endi qabul qilinmaydi
   * (`consentFormId` schema darajasida required). Form mavjud+shu bemor+
   * type='treatment'+amaldagi (isPerpetual YOKI expiresAt>now) bo'lmasa
   * `ConsentInvalidError`. Eski `consentSignedAt` ustuni bog'langan formaning
   * `signedAt`idan denormalized CACHE sifatida yoziladi (gate mantig'ida
   * ishlatilmaydi — faqat informatsion/backward-compat).
   */
  async function setConsent(c: Context, id: string, input: ConsentInput) {
    const before = await repo.findPlan(c, id);
    if (!before) return null;

    const form = await repo.findConsentForm(c, input.consentFormId);
    if (!isConsentFormCurrentlyValid(form, before.patientId) || !form) {
      throw new ConsentInvalidError();
    }

    const updated = await repo.updatePlan(c, id, {
      consentFormId: form.id,
      consentSignedAt: form.signedAt,
    });
    if (updated) {
      await deps.audit.record(c, {
        action: 'consent_linked',
        resourceType: 'treatment_plan',
        resourceId: id,
        before: { consentFormId: before.consentFormId ?? null },
        after: { consentFormId: updated.consentFormId, consentFormType: form.type },
      });
    }
    return updated;
  }

  async function updateStage(c: Context, stageId: string, input: UpdateStageInput) {
    // C2 guard: status/acceptance o'tishlarini tekshirish uchun joriy holat kerak.
    const current = await repo.findStage(c, stageId);
    if (!current) return null;

    const patch: Record<string, unknown> = {};
    let toStatus: StageStatus | undefined;
    if (input.status && input.status !== current.status) {
      assertStageStatusTransition(current.status, input.status);
      patch.status = input.status;
      toStatus = input.status;
      if (input.status === 'completed') patch.completedAt = new Date();
    }
    if (input.acceptance && input.acceptance !== current.acceptance) {
      assertStageAcceptanceTransition(current.acceptance, input.acceptance);
      patch.acceptance = input.acceptance;
    }
    if (input.notes !== undefined) patch.notes = input.notes;

    // Hech narsa o'zgarmadi (idempotent yoki bo'sh PATCH) — plan fetch/guard'dan
    // OLDIN erta qaytamiz (no-op arzon qoladi; guard'ga yetmaydi — xavfsiz).
    if (Object.keys(patch).length === 0) return current;

    // CLI-415: parent plan BIR MARTA olinadi — guard + recall reuse (qo'shimcha fetch yo'q).
    // Terminal (cancelled/completed) plan → mutatsiya RAD; draft/presented plan →
    // completed/in_progress RAD. Xato InvalidTransitionError subklassi → routes 400.
    const plan = await repo.findPlan(c, current.treatmentPlanId);
    if (plan) {
      assertStageMutationAllowedForPlan(plan.status, { toStatus });
    }

    const updated = await repo.updateStage(c, stageId, patch);
    if (updated) {
      // CLI-439 B9c: audit'ga `before` (joriy holat, mutatsiyadan oldin) ham yozamiz —
      // avval faqat `after` bor edi, stage tarixini tiklab bo'lmasdi.
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'treatment_stage',
        resourceId: stageId,
        before: { status: current.status, acceptance: current.acceptance, notes: current.notes },
        after: { status: input.status, acceptance: input.acceptance },
      });

      // B4: bosqich completed → treatment_followup recall (idempotent). Plan'dan
      // patientId/branchId kerak (stage'da yo'q). Guard cancelled/completed planda
      // avval otilgani uchun bu yerga faqat ruxsat etilgan plan holatida yetiladi.
      if (patch.status === 'completed' && deps.recall && plan) {
        await deps.recall.autoCreateFromStage(c, {
          patientId: plan.patientId,
          sourceStageId: updated.id,
          treatmentPlanId: plan.id,
        });
      }
    }
    return updated;
  }

  /**
   * C5: vizit yozuvi saqlanganda bosqichni 'completed' qilish — C2 guard'ga
   * bo'ysunadi (skipped→completed RAD). visit-notes service factory DI orqali
   * chaqiradi (modullar ajratilgan, to'g'ridan import yo'q). updateStage'ni
   * qayta ishlatadi → recall hook + audit + guard hammasi avtomatik ishlaydi.
   */
  async function completeStageForVisit(c: Context, stageId: string) {
    return updateStage(c, stageId, { status: 'completed' });
  }

  /**
   * C6 (CLI-223): plan smetasi — computed (saqlanmaydi). Per-stage cost/acceptance/
   * status + totallar. debtEligible YAGONA manbadan (computePlanBalance, C4 predikati)
   * → estimate, cashier va patient balansi hammasi MOS. Allocation filtrlanmaydi.
   */
  async function estimate(c: Context, planId: string) {
    const plan = await repo.findPlan(c, planId);
    if (!plan) return null;
    const full = await repo.getPlanWithStages(c, planId);
    const stageRows = full?.stages ?? [];
    const allocations = await repo.listStageAllocations(c, planId);

    // C4 pure fn — debtEligible (excludedFromDebt teskarisi) + paid + balance shu yerdan.
    const billing = computePlanBalance(
      stageRows.map((s) => ({
        id: s.id,
        serviceName: s.serviceName,
        cost: s.cost,
        status: s.status,
        acceptance: s.acceptance,
      })),
      allocations,
      plan.status,
    );
    const byStage = new Map(billing.stages.map((b) => [b.stageId, b]));

    const stages = stageRows.map((s) => {
      const b = byStage.get(s.id);
      return {
        stageId: s.id,
        serviceName: s.serviceName,
        cost: Number(s.cost),
        status: s.status,
        acceptance: s.acceptance,
        paid: b?.paid ?? 0,
        debtEligible: b ? !b.excludedFromDebt : false,
      };
    });

    const totalProposed = stages
      .filter((s) => s.acceptance === 'proposed')
      .reduce((sum, s) => sum + s.cost, 0);
    const totalCost = stages.reduce((sum, s) => sum + s.cost, 0);

    // CLI-439 B1: medical_record.view o'qishi — sensitive read (CLAUDE.md §3.10) —
    // audit_log'ga "viewed" yozuvi qo'shiladi (kontent'siz, faqat ko'rilgani; getPlan/
    // getMedicalRecord bilan bir xil pattern).
    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'treatment_plan_estimate',
      resourceId: planId,
    });

    return {
      planId,
      status: plan.status,
      totalProposed,
      totalAccepted: billing.totalCost, // C4 debt-eligible cost
      totalCost,
      totalPaid: billing.totalPaid,
      balance: billing.balance,
      stages,
    };
  }

  return {
    listPlans,
    getPlan,
    createPlan,
    updatePlan,
    setConsent,
    updateStage,
    completeStageForVisit,
    estimate,
  };
};

export type TreatmentPlansService = ReturnType<typeof createTreatmentPlansService>;
