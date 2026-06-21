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
