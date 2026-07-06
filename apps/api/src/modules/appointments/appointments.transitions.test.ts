import { describe, expect, it } from 'bun:test';
import {
  ACTIVE_STATUSES,
  type AppointmentStatus,
  AppointmentTransitionError,
  assertAppointmentTransition,
  isActiveStatus,
  isValidAppointmentTransition,
} from './appointments.transitions.ts';

describe('CLI-409 appointment transition matrix', () => {
  const valid: [AppointmentStatus, AppointmentStatus][] = [
    ['scheduled', 'confirmed'],
    ['confirmed', 'scheduled'],
    ['scheduled', 'in_progress'],
    ['confirmed', 'in_progress'],
    ['in_progress', 'completed'],
    ['scheduled', 'no_show'],
    ['confirmed', 'no_show'],
    ['scheduled', 'cancelled'],
    ['in_progress', 'cancelled'],
    ['cancelled', 'scheduled'], // qayta-faollashtirish
    ['no_show', 'scheduled'], // qayta bron
  ];

  const invalid: [AppointmentStatus, AppointmentStatus][] = [
    ['completed', 'scheduled'],
    ['completed', 'cancelled'],
    ['completed', 'in_progress'],
    ['scheduled', 'completed'], // in_progress'siz to'g'ridan completed yo'q
    ['no_show', 'in_progress'],
    ['no_show', 'confirmed'],
    ['cancelled', 'in_progress'],
    ['cancelled', 'confirmed'],
    ['in_progress', 'scheduled'],
    ['in_progress', 'confirmed'],
  ];

  it.each(valid)('valid: %s → %s', (from, to) => {
    expect(isValidAppointmentTransition(from, to)).toBe(true);
    expect(() => assertAppointmentTransition(from, to)).not.toThrow();
  });

  it.each(invalid)('invalid: %s → %s', (from, to) => {
    expect(isValidAppointmentTransition(from, to)).toBe(false);
    expect(() => assertAppointmentTransition(from, to)).toThrow(AppointmentTransitionError);
  });

  it('idempotent X → X allowed for all statuses', () => {
    const all: AppointmentStatus[] = [
      'scheduled',
      'confirmed',
      'in_progress',
      'completed',
      'no_show',
      'cancelled',
    ];
    for (const s of all) {
      expect(isValidAppointmentTransition(s, s)).toBe(true);
    }
  });

  it('completed is terminal (no outgoing except idempotent)', () => {
    const all: AppointmentStatus[] = [
      'scheduled',
      'confirmed',
      'in_progress',
      'no_show',
      'cancelled',
    ];
    for (const to of all) {
      expect(isValidAppointmentTransition('completed', to)).toBe(false);
    }
  });

  it('error carries invalid_transition code', () => {
    try {
      assertAppointmentTransition('completed', 'scheduled');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AppointmentTransitionError);
      expect((e as AppointmentTransitionError).code).toBe('status.invalid_transition');
    }
  });

  it('active statuses = scheduled/confirmed/in_progress', () => {
    expect(ACTIVE_STATUSES).toEqual(['scheduled', 'confirmed', 'in_progress']);
    expect(isActiveStatus('scheduled')).toBe(true);
    expect(isActiveStatus('confirmed')).toBe(true);
    expect(isActiveStatus('in_progress')).toBe(true);
    expect(isActiveStatus('completed')).toBe(false);
    expect(isActiveStatus('no_show')).toBe(false);
    expect(isActiveStatus('cancelled')).toBe(false);
  });
});
