import type { ToothStateValue } from '@dental/db-schema';
import type { Context } from 'hono';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import {
  CrossEntityError,
  createOwnershipValidator,
  type OwnershipValidator,
} from '../../../lib/ownership.ts';
// C6: C4 qarz predikatini YAGONA manbadan ishlatish (cashier billing pure fn).
import { computePlanBalance } from '../../cashier/cashier.billing.ts';
import { createTreatmentPlansRepository } from './treatment-plans.repository.ts';
import type {
  ConsentInput,
  CreateStageInput,
  CreateTreatmentPlanInput,
  ListPlansQuery,
  RecordCompletedWorkInput,
  UpdateStageInput,
  UpdateTreatmentPlanInput,
} from './treatment-plans.schema.ts';
import {
  assertPlanTransition,
  assertStageAcceptanceTransition,
  assertStageMutationAllowedForPlan,
  assertStageStatusTransition,
  CompletedStageAcceptanceLockedError,
  PlanHasCompletedStagesError,
  PlanHasOpenStagesError,
  StageLabPendingError,
  StageNotAcceptedError,
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
      assignedDoctorId?: string | null;
    },
  ) => Promise<void>;
};

/**
 * CLI-488: tooth-charts modulidan inject qilinadigan narrow dep (recall pattern bilan
 * bir xil bog'liqlik yo'nalishi: treatment-plans → tooth-charts, to'g'ridan import emas).
 * Bosqich 'completed' bo'lganda `toothNumbers` uchun yangi odontogramma snapshot yozadi.
 */
/** FX-60: plan ekranidan yakunlangan bosqich uchun ombor BOM chiqimi (stock modul DI). */
export type StageStockHook = (
  c: Context,
  stage: { id: string; serviceId: string | null },
) => Promise<void>;

export type ToothChartStageHook = {
  recordStageCompletion: (
    c: Context,
    args: {
      patientId: string;
      toothNumbers: number[];
      state: ToothStateValue;
      sourceStageId: string;
    },
  ) => Promise<unknown>;
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

/**
 * FX-61: plan allaqachon bajarilmoqda/tugagan/bekor qilingan (in_progress, completed,
 * cancelled) bo'lsa konsentni qayta bog'lash RAD — davolash boshlangandan keyin
 * konsent tarixini jimgina almashtirib bo'lmaydi. Routes 409 (`plan.consent_locked`).
 */
export class ConsentLockedError extends Error {
  constructor(readonly planStatus: string) {
    super(`Consent cannot be relinked on a ${planStatus} plan`);
    this.name = 'ConsentLockedError';
  }
}

/**
 * FT-01: yakunlangan/bekor qilingan rejaga bosqich qo'shib bo'lmaydi. Routes 409
 * (`plan.locked`).
 */
export class PlanStagesLockedError extends Error {
  constructor(readonly planStatus: string) {
    super(`Cannot add stages to a ${planStatus} plan`);
    this.name = 'PlanStagesLockedError';
  }
}

/**
 * FT-01: bosqich kontenti (serviceId/serviceName/cost/toothNumbers) faqat `pending` va
 * to'lov allocation'i yo'q bo'lsa tahrirlanadi — boshlangan/to'langan ish narxi jimgina
 * o'zgarmasin. Routes 409 (`stage.locked`).
 */
export class StageLockedError extends Error {
  constructor(
    readonly stageStatus: string,
    readonly hasAllocations: boolean,
  ) {
    super(
      hasAllocations
        ? 'Stage has payment allocations — its content cannot be edited'
        : `Stage is ${stageStatus} — only pending stages can be edited`,
    );
    this.name = 'StageLockedError';
  }
}

/**
 * FT-01.2: «Bajarilgan ishni yozish» uchun tanlangan reja hali ishga tushmagan
 * (`draft|presented`) — bu holatda bosqichni yakunlab bo'lmaydi (CLI-415 guard). Routes 409
 * (`plan.not_active`). Bosqich yozilmaydi.
 */
export class PlanNotActiveForWorkError extends Error {
  constructor(readonly planStatus: string) {
    super(`Cannot record completed work on a ${planStatus} plan — accept the plan first`);
    this.name = 'PlanNotActiveForWorkError';
  }
}

/**
 * FT-01.2: «bajarilgan ish» bog'lanadigan vizit yozuvi allaqachon imzolangan (o'zgarmaydi,
 * UI-D4) yoki boshqa bosqichga bog'langan (CLI-481 — qayta yo'naltirish yo'q). Routes 409
 * (`visit_note.signed` / `visit_note.stage_linked`). Hech narsa yozilmaydi.
 */
export class VisitNoteNotLinkableError extends Error {
  constructor(readonly reason: 'signed' | 'stage_linked') {
    super(
      reason === 'signed'
        ? 'Visit note is signed and can no longer be linked to a stage'
        : 'Visit note is already linked to a treatment stage',
    );
    this.name = 'VisitNoteNotLinkableError';
  }
}

/** FT-01.2: avto-reja sarlavhasi — Toshkent vaqti bo'yicha joriy oy (`YYYY-MM`). */
export const completedWorkPlanTitle = (now: Date = new Date()) => {
  const ym = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  return `Bajarilgan ishlar ${ym}`;
};

const ACTIVE_WORK_PLAN_STATUSES = ['accepted', 'in_progress'] as const;

const sameTeeth = (a: readonly number[] | null, b: readonly number[] | null) => {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((n, i) => n === y[i]);
};

const PLAN_STAGES_LOCKED_STATUSES = ['completed', 'cancelled'] as const;

const CONSENT_LOCKED_STATUSES = ['in_progress', 'completed', 'cancelled'] as const;

export const createTreatmentPlansService = (deps: {
  audit: AuditLogger;
  recall?: RecallStageHook;
  /** CLI-443: bosqich narxini serverda hisoblash uchun (faqat `serviceId` bor bosqichlarga). */
  priceLookup?: PriceLookup;
  ownership?: OwnershipValidator;
  /** CLI-488: bosqich 'completed' bo'lganda odontogramma auto-update (tooth-charts DI hook). */
  toothChart?: ToothChartStageHook;
  /**
   * FX-60: bosqich plan ekranidan 'completed' bo'lganda stage.serviceId BOM ombor chiqimi
   * (stock modul DI hook; idempotent + vizit chiqimi bilan dedup stock tomonida).
   */
  deductStageStock?: StageStockHook;
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
          resultingToothState: s.resultingToothState ?? null,
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

  /**
   * FT-01 (CF-11): mavjud rejaga bitta bosqich qo'shish (odontogramma «Joriy rejaga
   * qo'shish»). Reja `FOR UPDATE` bilan qulflanadi → `sequence` = max + 1 poygasiz.
   * Yakunlangan/bekor qilingan reja → `PlanStagesLockedError` (409). Narx `createPlan`
   * bilan bir xil (CLI-443): serviceId + filialda faol narx → server narxi.
   * Yangi bosqich doim `pending` + `proposed` (qarzga faqat qabul qilingandan keyin tushadi).
   */
  async function addStage(c: Context, planId: string, input: CreateStageInput) {
    const plan = await repo.lockPlan(c, planId);
    if (!plan) return null;
    if ((PLAN_STAGES_LOCKED_STATUSES as readonly string[]).includes(plan.status)) {
      throw new PlanStagesLockedError(plan.status);
    }
    if (input.serviceId) await ownership.assertServiceExists(c, input.serviceId);

    let cost = input.cost;
    const activeBranchId = c.get('activeBranchId');
    if (input.serviceId && activeBranchId && deps.priceLookup) {
      const price = await deps.priceLookup.getActivePrice(c, input.serviceId, activeBranchId);
      if (price) cost = Number(price.price);
    }

    const sequence = await repo.nextStageSequence(c, planId);
    const stage = await repo.insertStage(c, {
      treatmentPlanId: planId,
      sequence,
      serviceId: input.serviceId ?? null,
      serviceName: input.serviceName,
      toothNumbers: input.toothNumbers ?? null,
      estimatedVisits: input.estimatedVisits,
      estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
      cost: String(cost),
      notes: input.notes ?? null,
      resultingToothState: input.resultingToothState ?? null,
    });
    // FT-01: reja totalCost/totalVisits qotib qolmasin — bosqichlar yig'indisidan.
    await repo.recomputePlanTotals(c, planId);

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'treatment_stage',
      resourceId: stage.id,
      after: {
        treatmentPlanId: planId,
        sequence,
        serviceId: stage.serviceId,
        cost: stage.cost,
        toothNumbers: stage.toothNumbers,
      },
    });
    return stage;
  }

  /**
   * FT-01.2 (CF-12) — «Bajarilgan ishni yozish» 2-rejim. Har xizmat uchun darhol
   * `acceptance=accepted` bosqich yoziladi va X-3 yagona yakunlash yo'li (`completeStage`,
   * `source='plan'`) orqali `completed` bo'ladi → odontogramma snapshot, recall, BOM chiqimi
   * (vizit chiqimi bilan stock tomonida dedup). Bosqich reja qarziga tushadi (C4 predikati:
   * accepted ∧ completed ∧ reja `accepted|in_progress`).
   *
   * Barcha rad etuvchi tekshiruvlar (bemor, reja, xizmatlar, shifokor) INSERT'dan OLDIN —
   * 4xx `fail()` javobi tranzaksiyani COMMIT qiladi, yarim yozuv qolmasin. Insert'dan keyingi
   * kutilmagan xato throw bo'ladi (route ushlamaydi) → 500 → rollback.
   */
  async function recordCompletedWork(c: Context, input: RecordCompletedWorkInput) {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) throw new Error('No tenant context');

    await ownership.assertPatientExists(c, input.patientId);
    for (const item of input.items) {
      if (item.serviceId) await ownership.assertServiceExists(c, item.serviceId);
    }

    await repo.lockPatientCompletedWork(c, input.patientId);

    // Vizit bog'lash (ixtiyoriy): shu bemorniki, imzolanmagan, bosqichsiz — INSERT'dan OLDIN.
    if (input.visitNoteId) {
      const note = await repo.lockVisitNote(c, input.visitNoteId);
      if (!note) throw new CrossEntityError('visit_note', 'not_found');
      if (note.patientId !== input.patientId) {
        throw new CrossEntityError('visit_note', 'mismatch');
      }
      if (note.signedAt) throw new VisitNoteNotLinkableError('signed');
      if (note.stageId) throw new VisitNoteNotLinkableError('stage_linked');
    }

    let plan: Awaited<ReturnType<typeof repo.lockPlan>>;
    if (input.planId) {
      plan = await repo.lockPlan(c, input.planId);
      if (!plan) throw new CrossEntityError('treatment_plan', 'not_found');
      if (plan.patientId !== input.patientId) {
        throw new CrossEntityError('treatment_plan', 'mismatch');
      }
      if ((PLAN_STAGES_LOCKED_STATUSES as readonly string[]).includes(plan.status)) {
        throw new PlanStagesLockedError(plan.status);
      }
      if (!(ACTIVE_WORK_PLAN_STATUSES as readonly string[]).includes(plan.status)) {
        throw new PlanNotActiveForWorkError(plan.status);
      }
    } else {
      plan = await repo.lockLatestActivePlan(c, input.patientId);
    }

    let planCreated = false;
    if (!plan) {
      // Avto-reja shifokori — komissiya manbai (D-13 COALESCE(plan.doctor_id, …)): boshqa
      // shifokor nomidan yozish `medical_record.on_behalf` talab qiladi (FX-155 naqshi).
      const doctorId = input.doctorId ?? c.get('user')?.id;
      if (!doctorId) throw new Error('No user context');
      await ownership.assertPractitioner(c, doctorId, 'medical_record.on_behalf');
      const created = await repo.insertPlanWithStages(
        c,
        tenantId,
        {
          tenantId,
          patientId: input.patientId,
          doctorId,
          title: completedWorkPlanTitle(),
          status: 'in_progress',
          totalCost: '0',
          totalVisits: 0,
          notes: null,
        },
        () => [],
      );
      const { stages: _none, ...planRow } = created;
      plan = planRow;
      planCreated = true;
    }

    const activeBranchId = c.get('activeBranchId');
    const stages = [];
    for (const item of input.items) {
      let cost = item.cost;
      if (item.serviceId && activeBranchId && deps.priceLookup) {
        const price = await deps.priceLookup.getActivePrice(c, item.serviceId, activeBranchId);
        if (price) cost = Number(price.price);
      }
      const sequence = await repo.nextStageSequence(c, plan.id);
      const inserted = await repo.insertStage(c, {
        treatmentPlanId: plan.id,
        sequence,
        serviceId: item.serviceId ?? null,
        serviceName: item.serviceName,
        toothNumbers: item.toothNumbers ?? null,
        estimatedVisits: item.estimatedVisits,
        estimatedDurationMinutes: item.estimatedDurationMinutes ?? null,
        cost: String(cost),
        notes: item.notes ?? null,
        resultingToothState: item.resultingToothState ?? null,
        acceptance: 'accepted',
      });
      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'treatment_stage',
        resourceId: inserted.id,
        after: {
          treatmentPlanId: plan.id,
          sequence,
          serviceId: inserted.serviceId,
          cost: inserted.cost,
          toothNumbers: inserted.toothNumbers,
          acceptance: 'accepted',
          completedWork: true,
        },
      });
      // Vizit bog'lanishi yakunlashdan OLDIN — BOM dedup (deductForStage) vizit allaqachon
      // yechgan shu xizmatni ko'rsin; imzo (`sign`) keyin bosqichni idempotent o'tkazadi.
      if (input.visitNoteId) {
        const linked = await repo.linkVisitNoteStage(c, input.visitNoteId, inserted.id);
        if (!linked) throw new Error(`Visit note ${input.visitNoteId} could not be linked`);
        await deps.audit.record(c, {
          action: 'updated',
          resourceType: 'visit_note',
          resourceId: input.visitNoteId,
          before: { stageId: null },
          after: { stageId: inserted.id, completedWork: true },
        });
      }
      // X-3: yagona yakunlash yo'li (guard'lar + recall + odontogramma + BOM).
      const completed = await completeStage(c, inserted.id, { source: 'plan' });
      if (!completed || completed.status !== 'completed') {
        throw new Error(`Completed-work stage ${inserted.id} was not completed`);
      }
      stages.push(completed);
    }
    await repo.recomputePlanTotals(c, plan.id);

    return { planId: plan.id, planCreated, stages };
  }

  async function updatePlan(c: Context, id: string, input: UpdateTreatmentPlanInput) {
    const before = await repo.findPlan(c, id);
    if (!before) return null;

    // C2 guard: plan status o'tishi (draft→presented→accepted→in_progress→completed/cancelled).
    if (input.status && input.status !== before.status) {
      assertPlanTransition(before.status, input.status);
      // FX-15 (LA-32): bajarilgan bosqichli rejani bekor qilib bo'lmaydi (qarz yo'qolardi).
      if (input.status === 'cancelled' && (await repo.countCompletedStages(c, id)) > 0) {
        throw new PlanHasCompletedStagesError(before.status);
      }
      // FX-16 (LA-37): bajarilmagan accepted bosqich bilan rejani yakunlab bo'lmaydi.
      if (input.status === 'completed') {
        const open = await repo.countOpenAcceptedStages(c, id);
        if (open > 0) throw new PlanHasOpenStagesError(before.status, open);
      }
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

    if ((CONSENT_LOCKED_STATUSES as readonly string[]).includes(before.status)) {
      throw new ConsentLockedError(before.status);
    }

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

  /**
   * X-3: bosqichni yangilashning YAGONA yo'li (status=completed ham shu yerdan). Plan
   * ekrani (`updateStage`) va vizit yo'li (`completeStage`) shu funksiyaga tushadi:
   * status/acceptance/plan/lab guard'lari + FX-13 acceptance gate + completed-hook'lar
   * (recall, odontogramma) bir joyda. Ombor chiqimi: plan yo'li (`source='plan'`) — FX-60
   * `deductStageStock` hook; vizit yo'li `performedServices`dan o'zi chiqim qiladi (ikki marta
   * chiqim xavfi — stock tomonida dedup).
   */
  async function applyStageUpdate(
    c: Context,
    stageId: string,
    input: UpdateStageInput,
    source: 'plan' | 'visit',
  ) {
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
      // FX-15 (LA-32): completed + accepted bosqich rejected/proposed'ga qaytarilmaydi.
      if (current.status === 'completed' && current.acceptance === 'accepted') {
        throw new CompletedStageAcceptanceLockedError(input.acceptance);
      }
      patch.acceptance = input.acceptance;
    }
    if (input.notes !== undefined) patch.notes = input.notes;
    // CLI-487/488 (API wiring): lab-order linkage + resulting tooth state. `!== undefined`
    // → `null` aniq uzadi, "yo'q" tegmaydi (patch.notes precedenti). Ownership guard
    // (labOrderId) plan fetch'dan KEYIN (patientId kerak).
    if (input.resultingToothState !== undefined) {
      patch.resultingToothState = input.resultingToothState;
    }
    if (input.labOrderId !== undefined) patch.labOrderId = input.labOrderId;

    // FT-01: kontent tahriri (serviceId/serviceName/cost/toothNumbers). Faqat haqiqatda
    // o'zgargan maydonlar hisobga olinadi (bir xil qiymatni qayta yuborish qulfga urilmaydi).
    const content: Record<string, unknown> = {};
    if (input.serviceName !== undefined && input.serviceName !== current.serviceName) {
      content.serviceName = input.serviceName;
    }
    if (input.toothNumbers !== undefined && !sameTeeth(input.toothNumbers, current.toothNumbers)) {
      content.toothNumbers = input.toothNumbers;
    }
    if (input.serviceId !== undefined && input.serviceId !== current.serviceId) {
      if (input.serviceId) await ownership.assertServiceExists(c, input.serviceId);
      content.serviceId = input.serviceId;
    }
    if (input.cost !== undefined || 'serviceId' in content) {
      const effectiveServiceId =
        input.serviceId !== undefined ? input.serviceId : current.serviceId;
      let cost = input.cost ?? Number(current.cost);
      // CLI-443: xizmatli bosqich narxi filial narxidan (createPlan/addStage bilan bir xil).
      const activeBranchId = c.get('activeBranchId');
      if (effectiveServiceId && activeBranchId && deps.priceLookup) {
        const price = await deps.priceLookup.getActivePrice(c, effectiveServiceId, activeBranchId);
        if (price) cost = Number(price.price);
      }
      if (cost !== Number(current.cost)) content.cost = String(cost);
    }
    if (Object.keys(content).length > 0) {
      const hasAllocations = await repo.hasStageAllocations(c, stageId);
      if (current.status !== 'pending' || hasAllocations) {
        throw new StageLockedError(current.status, hasAllocations);
      }
      Object.assign(patch, content);
    }

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

    // CLI-487 (API wiring): lab-order'ni bosqichga bog'lashda u shu bemorga tegishli
    // bo'lishi shart (RLS tenant'ni, guard patientId'ni tekshiradi — FK RLS'ni chetlab
    // o'tadi). `null` → uzish (guard yo'q). Plan fetch'dan KEYIN (patientId kerak).
    if (input.labOrderId != null) {
      const lab = await repo.findLabOrderStatus(c, input.labOrderId);
      if (!lab) throw new CrossEntityError('lab_order', 'not_found');
      if (plan && lab.patientId !== plan.patientId) {
        throw new CrossEntityError('lab_order', 'mismatch');
      }
    }

    // X-3 + FX-13 (LA-36, D-11): 'completed' faqat EFFEKTIV acceptance 'accepted' bo'lsa
    // (shu PATCH'dagi yangi acceptance ham hisobga olinadi). Persist'dan OLDIN.
    if (toStatus === 'completed') {
      const effectiveAcceptance = input.acceptance ?? current.acceptance;
      if (effectiveAcceptance !== 'accepted') {
        throw new StageNotAcceptedError(effectiveAcceptance);
      }
    }

    // CLI-487: lab-order gate — bosqichni 'completed' qilishda bog'langan lab-order
    // 'delivered' bo'lishi shart. Plan-guard'dan KEYIN, persist'dan OLDIN (completed
    // yozilmaydi). `effectiveLabOrderId` — ayni PATCH'da bog'langan yangi link'ni ham
    // qamraydi (link + complete bir chaqiruvda). RLS → null → fail-safe blok.
    const effectiveLabOrderId =
      input.labOrderId !== undefined ? input.labOrderId : current.labOrderId;
    if (toStatus === 'completed' && effectiveLabOrderId) {
      const lab = await repo.findLabOrderStatus(c, effectiveLabOrderId);
      if (!lab || lab.status !== 'delivered') {
        throw new StageLabPendingError(lab?.status ?? 'missing');
      }
    }

    const updated = await repo.updateStage(c, stageId, patch);
    // FT-01: narx o'zgardi → reja totalCost bosqichlar yig'indisidan qayta hisoblanadi.
    if (updated && 'cost' in content) {
      await repo.recomputePlanTotals(c, current.treatmentPlanId);
    }
    if (updated) {
      // CLI-439 B9c: audit'ga `before` (joriy holat, mutatsiyadan oldin) ham yozamiz —
      // avval faqat `after` bor edi, stage tarixini tiklab bo'lmasdi.
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'treatment_stage',
        resourceId: stageId,
        before: {
          status: current.status,
          acceptance: current.acceptance,
          notes: current.notes,
          ...('serviceId' in content ? { serviceId: current.serviceId } : {}),
          ...('serviceName' in content ? { serviceName: current.serviceName } : {}),
          ...('cost' in content ? { cost: current.cost } : {}),
          ...('toothNumbers' in content ? { toothNumbers: current.toothNumbers } : {}),
        },
        after: {
          status: input.status,
          acceptance: input.acceptance,
          ...content,
          ...(patch.status === 'completed' ? { source } : {}),
        },
      });

      // Bosqich completed → hook'lar (idempotent — completed-o'tish faqat bir marta,
      // qayta PATCH yuqorida erta qaytadi). Guard cancelled/completed planda avval
      // otilgani uchun bu yerga faqat ruxsat etilgan plan holatida yetiladi.
      if (patch.status === 'completed' && plan) {
        // B4: treatment_followup recall. Plan'dan patientId/doctorId kerak (stage'da yo'q).
        if (deps.recall) {
          await deps.recall.autoCreateFromStage(c, {
            patientId: plan.patientId,
            sourceStageId: updated.id,
            treatmentPlanId: plan.id,
            // CLI-474 (L9): recall'ni davolash rejasi doktoriga biriktir.
            assignedDoctorId: plan.doctorId,
          });
        }
        // FX-60: plan ekranidan yakunlash — vizit yo'li BOM'ni `performedServices`dan o'zi
        // yechadi (source='visit' bu yerda yechmaydi); plan yo'li uchun stage.serviceId.
        if (source === 'plan' && deps.deductStageStock) {
          await deps.deductStageStock(c, { id: updated.id, serviceId: updated.serviceId });
        }
        // CLI-488: odontogramma auto-update — bosqichda resultingToothState + toothNumbers
        // bo'lsa yangi tooth_chart snapshot (immutable model; tooth-charts DI hook).
        if (deps.toothChart && updated.resultingToothState && updated.toothNumbers?.length) {
          await deps.toothChart.recordStageCompletion(c, {
            patientId: plan.patientId,
            toothNumbers: updated.toothNumbers,
            state: updated.resultingToothState,
            sourceStageId: updated.id,
          });
        }
      }
    }
    return updated;
  }

  async function updateStage(c: Context, stageId: string, input: UpdateStageInput) {
    return applyStageUpdate(c, stageId, input, 'plan');
  }

  /** X-3: bosqichni yakunlash — yagona servis funksiyasi (`source` audit uchun). */
  async function completeStage(c: Context, stageId: string, opts: { source: 'plan' | 'visit' }) {
    return applyStageUpdate(c, stageId, { status: 'completed' }, opts.source);
  }

  /**
   * C5: vizit yozuvi saqlanganda bosqichni 'completed' qilish — visit-notes service
   * factory DI orqali chaqiradi (modullar ajratilgan, to'g'ridan import yo'q).
   * X-3: `completeStage` orqali → acceptance gate + recall + odontogramma + guard'lar.
   */
  async function completeStageForVisit(c: Context, stageId: string) {
    return completeStage(c, stageId, { source: 'visit' });
  }

  /**
   * FX-14 (LA-33, D-9): vizit QORALAMASI bosqichni faqat boshlaydi (`pending` →
   * `in_progress`); yopish `sign()`da (`completeStageForVisit`). Allaqachon
   * `in_progress`/`completed` bosqichga hech narsa qilmaydi (keyingi vizitlar);
   * `skipped` → applyStageUpdate transition guard 400. Plan-guard (draft/cancelled)
   * ham shu yerdan o'tadi — qoralama saqlashdayoq xato beradi.
   */
  async function startStageForVisit(c: Context, stageId: string) {
    const current = await repo.findStage(c, stageId);
    if (!current) return null;
    if (current.status === 'in_progress' || current.status === 'completed') return current;
    return applyStageUpdate(c, stageId, { status: 'in_progress' }, 'visit');
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
    addStage,
    recordCompletedWork,
    updatePlan,
    setConsent,
    updateStage,
    completeStage,
    completeStageForVisit,
    startStageForVisit,
    estimate,
  };
};

export type TreatmentPlansService = ReturnType<typeof createTreatmentPlansService>;
