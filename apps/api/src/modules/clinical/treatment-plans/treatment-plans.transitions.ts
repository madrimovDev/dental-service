/**
 * Treatment plan/stage STATE-MACHINE guard — SOF funksiyalar (Context/Drizzle YO'Q).
 * Service shularni chaqiradi; noto'g'ri o'tish → routes 400 ga aylantiradi.
 *
 * Uchta mustaqil o'q (Epic C, Qaror #25):
 *   - plan.status:        draft → presented → accepted → in_progress → completed/cancelled
 *   - stage.status:       pending → in_progress → completed; pending/in_progress → skipped
 *   - stage.acceptance:   proposed → accepted/rejected  (qabul = ALOHIDA o'q)
 *
 * Idempotent re-set (X → X) ham ruxsat etiladi — PATCH'ni qayta yuborish xato emas.
 */

export type PlanStatus =
  | 'draft'
  | 'presented'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export type StageAcceptance = 'proposed' | 'accepted' | 'rejected';

/** Noto'g'ri o'tishda otiladi; routes 400 (`*.invalid_transition`) ga aylantiradi. */
export class InvalidTransitionError extends Error {
  constructor(
    readonly axis: 'plan' | 'stage_status' | 'stage_acceptance',
    readonly from: string,
    readonly to: string,
  ) {
    super(`Invalid ${axis} transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

// ─── Plan status ──────────────────────────────────────────────────────────────

const PLAN_TRANSITIONS: Record<PlanStatus, readonly PlanStatus[]> = {
  draft: ['presented', 'cancelled'],
  presented: ['accepted', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function isValidPlanTransition(from: PlanStatus, to: PlanStatus): boolean {
  if (from === to) return true; // idempotent
  return PLAN_TRANSITIONS[from].includes(to);
}

export function assertPlanTransition(from: PlanStatus, to: PlanStatus): void {
  if (!isValidPlanTransition(from, to)) {
    throw new InvalidTransitionError('plan', from, to);
  }
}

// ─── Stage status ─────────────────────────────────────────────────────────────

const STAGE_STATUS_TRANSITIONS: Record<StageStatus, readonly StageStatus[]> = {
  pending: ['in_progress', 'completed', 'skipped'],
  in_progress: ['completed', 'skipped'],
  // Yakuniy statuslar — skipped'dan completed'ga (yoki aksincha) o'tish RAD.
  completed: [],
  skipped: [],
};

export function isValidStageStatusTransition(from: StageStatus, to: StageStatus): boolean {
  if (from === to) return true; // idempotent
  return STAGE_STATUS_TRANSITIONS[from].includes(to);
}

export function assertStageStatusTransition(from: StageStatus, to: StageStatus): void {
  if (!isValidStageStatusTransition(from, to)) {
    throw new InvalidTransitionError('stage_status', from, to);
  }
}

// ─── Stage acceptance ─────────────────────────────────────────────────────────

const STAGE_ACCEPTANCE_TRANSITIONS: Record<StageAcceptance, readonly StageAcceptance[]> = {
  proposed: ['accepted', 'rejected'],
  // Qabul/rad qaytarib qarorni qayta ko'rib chiqishga ruxsat (proposed'ga qaytarish).
  accepted: ['rejected', 'proposed'],
  rejected: ['accepted', 'proposed'],
};

export function isValidStageAcceptanceTransition(
  from: StageAcceptance,
  to: StageAcceptance,
): boolean {
  if (from === to) return true; // idempotent
  return STAGE_ACCEPTANCE_TRANSITIONS[from].includes(to);
}

export function assertStageAcceptanceTransition(from: StageAcceptance, to: StageAcceptance): void {
  if (!isValidStageAcceptanceTransition(from, to)) {
    throw new InvalidTransitionError('stage_acceptance', from, to);
  }
}

// ─── Stage mutation vs parent PLAN status guard (CLI-415) ───────────────────────
//
// Stage o'qi (yuqorida) parent plan statusidan bexabar edi — bekor/tugatilgan planda
// ham bosqich 'completed' bo'la olardi (va recall fire qilardi). Bu guard bosqich
// mutatsiyasini plan statusiga qarshi tekshiradi. Ikkala xato ham InvalidTransitionError
// SUBKLASSI — visit-notes/treatment-plans routes'dagi mavjud `instanceof
// InvalidTransitionError` catch ularni o'zgarishsiz 400 ga aylantiradi.

/** Terminal plan (cancelled/completed) — bosqichning HAR QANDAY mutatsiyasi RAD. */
export class PlanLockedError extends InvalidTransitionError {
  constructor(readonly planStatus: PlanStatus) {
    super('stage_status', `plan:${planStatus}`, 'mutate');
    this.name = 'PlanLockedError';
  }
}

/** Ishlanmagan plan (draft/presented) — bosqichni completed/in_progress qilib bo'lmaydi. */
export class PlanNotActiveError extends InvalidTransitionError {
  constructor(
    readonly planStatus: PlanStatus,
    to: StageStatus,
  ) {
    super('stage_status', `plan:${planStatus}`, to);
    this.name = 'PlanNotActiveError';
  }
}

/**
 * CLI-487: bog'langan lab-order hali 'delivered' emas — bosqichni 'completed' qilib
 * bo'lmaydi. InvalidTransitionError SUBKLASSI (PlanLockedError precedenti) →
 * visit-notes/treatment-plans routes'dagi mavjud `instanceof InvalidTransitionError`
 * catch uni 400 (`stage.invalid_transition`) ga aylantiradi (route o'zgarishi shart emas).
 * `labStatus` — bloklovchi joriy lab-order statusi (draft/sent/in_progress/ready/
 * cancelled) yoki 'missing' (link uzilib qolgan/cross-tenant → fail-safe blok).
 */
export class StageLabPendingError extends InvalidTransitionError {
  constructor(readonly labStatus: string) {
    super('stage_status', `lab:${labStatus}`, 'completed');
    this.name = 'StageLabPendingError';
    this.message = `Cannot complete stage: linked lab order is '${labStatus}', not 'delivered'.`;
  }
}

/**
 * CLI-415: bosqich mutatsiyasini parent plan statusiga qarshi tekshiradi.
 *   - cancelled/completed plan → har qanday bosqich mutatsiyasi RAD (PlanLockedError).
 *   - draft/presented plan → bosqichni completed/in_progress qilib bo'lmaydi
 *     (PlanNotActiveError); skipped/acceptance/notes OK (reja tuzish davri).
 *   - accepted/in_progress → har qanday valid stage transition OK.
 *
 * `toStatus` — patch stage'ni o'tkazayotgan yangi status (status o'zgarayotgan bo'lsa).
 * Guard tufayli recall hook cancelled planda hech qachon yetib bormaydi.
 */
export function assertStageMutationAllowedForPlan(
  planStatus: PlanStatus,
  patch: { toStatus?: StageStatus },
): void {
  if (planStatus === 'cancelled' || planStatus === 'completed') {
    throw new PlanLockedError(planStatus);
  }
  if (planStatus === 'draft' || planStatus === 'presented') {
    if (patch.toStatus === 'completed' || patch.toStatus === 'in_progress') {
      throw new PlanNotActiveError(planStatus, patch.toStatus);
    }
  }
}
