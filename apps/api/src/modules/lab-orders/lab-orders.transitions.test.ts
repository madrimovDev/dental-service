import { describe, expect, it } from 'bun:test';
import {
  assertLabOrderTransition,
  InvalidLabOrderTransitionError,
  isValidLabOrderRemakeTransition,
  isValidLabOrderTransition,
} from './lab-orders.transitions.ts';

describe('CLI-439 B2 — lab order status transitions', () => {
  it('valid forward linear path', () => {
    expect(isValidLabOrderTransition('draft', 'sent')).toBe(true);
    expect(isValidLabOrderTransition('sent', 'in_progress')).toBe(true);
    expect(isValidLabOrderTransition('in_progress', 'ready')).toBe(true);
    expect(isValidLabOrderTransition('ready', 'delivered')).toBe(true);
  });

  it('cancel allowed from any non-terminal', () => {
    expect(isValidLabOrderTransition('draft', 'cancelled')).toBe(true);
    expect(isValidLabOrderTransition('sent', 'cancelled')).toBe(true);
    expect(isValidLabOrderTransition('in_progress', 'cancelled')).toBe(true);
    expect(isValidLabOrderTransition('ready', 'cancelled')).toBe(true);
  });

  it('idempotent re-set allowed', () => {
    expect(isValidLabOrderTransition('sent', 'sent')).toBe(true);
    expect(isValidLabOrderTransition('delivered', 'delivered')).toBe(true);
  });

  it('CRITICAL: delivered → draft rejected (regression bug)', () => {
    expect(isValidLabOrderTransition('delivered', 'draft')).toBe(false);
    expect(() => assertLabOrderTransition('delivered', 'draft')).toThrow(
      InvalidLabOrderTransitionError,
    );
  });

  it('CRITICAL: cancelled → delivered rejected (regression bug)', () => {
    expect(isValidLabOrderTransition('cancelled', 'delivered')).toBe(false);
    expect(() => assertLabOrderTransition('cancelled', 'delivered')).toThrow(
      InvalidLabOrderTransitionError,
    );
  });

  it('terminal states reject all forward moves too', () => {
    expect(isValidLabOrderTransition('delivered', 'ready')).toBe(false);
    expect(isValidLabOrderTransition('cancelled', 'sent')).toBe(false);
  });

  it('skipping stages forward is rejected (no jump draft → ready)', () => {
    expect(isValidLabOrderTransition('draft', 'ready')).toBe(false);
    expect(isValidLabOrderTransition('draft', 'delivered')).toBe(false);
  });

  it('backward within active flow rejected (ready → sent)', () => {
    expect(isValidLabOrderTransition('ready', 'sent')).toBe(false);
    expect(isValidLabOrderTransition('in_progress', 'draft')).toBe(false);
  });
});

describe('Lab Hub remake — tor o‘tish (faqat sinxron)', () => {
  it('ready/delivered → in_progress ruxsat; boshqalar yo‘q', () => {
    expect(isValidLabOrderRemakeTransition('ready')).toBe(true);
    expect(isValidLabOrderRemakeTransition('delivered')).toBe(true);
    for (const s of ['draft', 'sent', 'in_progress', 'cancelled'] as const) {
      expect(isValidLabOrderRemakeTransition(s)).toBe(false);
    }
  });
  it('foydalanuvchi PATCH’i baribir forward-only', () => {
    expect(isValidLabOrderTransition('ready', 'in_progress')).toBe(false);
    expect(isValidLabOrderTransition('delivered', 'in_progress')).toBe(false);
  });
});
