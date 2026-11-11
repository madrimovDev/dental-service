import { describe, expect, test } from 'bun:test';
import { computeSubscriptionState } from './subscription.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-12T12:00:00.000Z');
const at = (offsetDays: number) => new Date(NOW + offsetDays * DAY);

describe('computeSubscriptionState (L8 — P18 bilan bir xil chegaralar)', () => {
  test('muddat noma‘lum → none (bloklanmaydi, banner yo‘q)', () => {
    expect(computeSubscriptionState(null, NOW).state).toBe('none');
    expect(computeSubscriptionState(undefined, NOW).state).toBe('none');
  });
  test('active / expiring (≤14 kun) / grace (7 kun) / expired', () => {
    expect(computeSubscriptionState(at(60), NOW).state).toBe('active');
    expect(computeSubscriptionState(at(10), NOW)).toMatchObject({
      state: 'expiring',
      daysLeft: 10,
    });
    expect(computeSubscriptionState(at(-1), NOW)).toMatchObject({ state: 'grace', daysLeft: 6 });
    expect(computeSubscriptionState(at(-6.5), NOW).state).toBe('grace');
    expect(computeSubscriptionState(at(-7), NOW).state).toBe('expired');
    expect(computeSubscriptionState(at(-40), NOW).state).toBe('expired');
  });
  test('ISO satr ham qabul qilinadi; buzuq sana → expired (bloklash tomoniga)', () => {
    expect(computeSubscriptionState(at(-1).toISOString(), NOW).state).toBe('grace');
    expect(computeSubscriptionState('not-a-date', NOW).state).toBe('expired');
  });
});
