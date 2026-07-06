import { describe, expect, it } from 'bun:test';
import {
  assertPlanTransition,
  assertStageAcceptanceTransition,
  assertStageMutationAllowedForPlan,
  assertStageStatusTransition,
  InvalidTransitionError,
  isValidPlanTransition,
  isValidStageAcceptanceTransition,
  isValidStageStatusTransition,
  PlanLockedError,
  PlanNotActiveError,
} from './treatment-plans.transitions.ts';

describe('plan status transitions', () => {
  it('valid linear path', () => {
    expect(isValidPlanTransition('draft', 'presented')).toBe(true);
    expect(isValidPlanTransition('presented', 'accepted')).toBe(true);
    expect(isValidPlanTransition('accepted', 'in_progress')).toBe(true);
    expect(isValidPlanTransition('in_progress', 'completed')).toBe(true);
  });

  it('cancel allowed from any non-terminal', () => {
    expect(isValidPlanTransition('draft', 'cancelled')).toBe(true);
    expect(isValidPlanTransition('accepted', 'cancelled')).toBe(true);
    expect(isValidPlanTransition('in_progress', 'cancelled')).toBe(true);
  });

  it('idempotent re-set allowed', () => {
    expect(isValidPlanTransition('accepted', 'accepted')).toBe(true);
    expect(isValidPlanTransition('completed', 'completed')).toBe(true);
  });

  it('rejects skipping stages', () => {
    expect(isValidPlanTransition('draft', 'completed')).toBe(false);
    expect(isValidPlanTransition('draft', 'accepted')).toBe(false);
    expect(isValidPlanTransition('presented', 'in_progress')).toBe(false);
  });

  it('rejects transitions out of terminal states', () => {
    expect(isValidPlanTransition('completed', 'in_progress')).toBe(false);
    expect(isValidPlanTransition('cancelled', 'draft')).toBe(false);
  });

  it('assert throws InvalidTransitionError on invalid', () => {
    expect(() => assertPlanTransition('draft', 'completed')).toThrow(InvalidTransitionError);
    expect(() => assertPlanTransition('draft', 'presented')).not.toThrow();
  });
});

describe('stage status transitions', () => {
  it('valid execution path', () => {
    expect(isValidStageStatusTransition('pending', 'in_progress')).toBe(true);
    expect(isValidStageStatusTransition('in_progress', 'completed')).toBe(true);
    expect(isValidStageStatusTransition('pending', 'completed')).toBe(true);
  });

  it('skip allowed from pending/in_progress', () => {
    expect(isValidStageStatusTransition('pending', 'skipped')).toBe(true);
    expect(isValidStageStatusTransition('in_progress', 'skipped')).toBe(true);
  });

  it('CRITICAL: skipped → completed REJECTED', () => {
    expect(isValidStageStatusTransition('skipped', 'completed')).toBe(false);
    expect(() => assertStageStatusTransition('skipped', 'completed')).toThrow(
      InvalidTransitionError,
    );
  });

  it('completed is terminal', () => {
    expect(isValidStageStatusTransition('completed', 'in_progress')).toBe(false);
    expect(isValidStageStatusTransition('completed', 'skipped')).toBe(false);
  });

  it('idempotent re-set allowed', () => {
    expect(isValidStageStatusTransition('completed', 'completed')).toBe(true);
    expect(isValidStageStatusTransition('skipped', 'skipped')).toBe(true);
  });
});

describe('stage acceptance transitions', () => {
  it('proposed → accepted/rejected', () => {
    expect(isValidStageAcceptanceTransition('proposed', 'accepted')).toBe(true);
    expect(isValidStageAcceptanceTransition('proposed', 'rejected')).toBe(true);
  });

  it('revisable: accepted ↔ rejected, back to proposed', () => {
    expect(isValidStageAcceptanceTransition('accepted', 'rejected')).toBe(true);
    expect(isValidStageAcceptanceTransition('rejected', 'accepted')).toBe(true);
    expect(isValidStageAcceptanceTransition('accepted', 'proposed')).toBe(true);
  });

  it('idempotent re-set allowed', () => {
    expect(isValidStageAcceptanceTransition('accepted', 'accepted')).toBe(true);
  });

  it('assert throws on invalid type pairing handled by enum (sanity)', () => {
    expect(() => assertStageAcceptanceTransition('proposed', 'accepted')).not.toThrow();
  });
});

describe('CLI-415 — stage mutation guarded by parent plan status', () => {
  it('terminal plan (cancelled/completed) rejects ANY mutation', () => {
    expect(() => assertStageMutationAllowedForPlan('cancelled', { toStatus: 'completed' })).toThrow(
      PlanLockedError,
    );
    expect(() => assertStageMutationAllowedForPlan('completed', { toStatus: 'skipped' })).toThrow(
      PlanLockedError,
    );
    // acceptance/notes only (no toStatus) — still rejected on terminal plan.
    expect(() => assertStageMutationAllowedForPlan('cancelled', {})).toThrow(PlanLockedError);
  });

  it('unworked plan (draft/presented) rejects completed/in_progress', () => {
    expect(() => assertStageMutationAllowedForPlan('draft', { toStatus: 'completed' })).toThrow(
      PlanNotActiveError,
    );
    expect(() =>
      assertStageMutationAllowedForPlan('presented', { toStatus: 'in_progress' }),
    ).toThrow(PlanNotActiveError);
  });

  it('unworked plan allows skipped / acceptance / notes-only', () => {
    expect(() => assertStageMutationAllowedForPlan('draft', { toStatus: 'skipped' })).not.toThrow();
    expect(() => assertStageMutationAllowedForPlan('draft', {})).not.toThrow();
    expect(() => assertStageMutationAllowedForPlan('presented', {})).not.toThrow();
  });

  it('active plan (accepted/in_progress) allows completed', () => {
    expect(() =>
      assertStageMutationAllowedForPlan('accepted', { toStatus: 'completed' }),
    ).not.toThrow();
    expect(() =>
      assertStageMutationAllowedForPlan('in_progress', { toStatus: 'completed' }),
    ).not.toThrow();
  });

  it('guard errors are InvalidTransitionError subclasses (routes convert to 400)', () => {
    expect(() => assertStageMutationAllowedForPlan('cancelled', {})).toThrow(
      InvalidTransitionError,
    );
    expect(() => assertStageMutationAllowedForPlan('draft', { toStatus: 'completed' })).toThrow(
      InvalidTransitionError,
    );
  });
});
