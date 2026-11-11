import { describe, expect, it } from 'vitest';
import { buildNavPills } from './settings.navPills';

const items = (o: Record<string, boolean>) =>
  Object.entries(o).map(([key, ok]) => ({ key, ok })) as {
    key:
      | 'workHours'
      | 'doctorSchedule'
      | 'servicePrices'
      | 'channel'
      | 'staff'
      | 'license'
      | 'backup';
    ok: boolean;
  }[];

const now = new Date('2026-11-12T12:00:00Z');

describe('buildNavPills', () => {
  it('Filiallar: workHours + doctorSchedule muammolari soni; hammasi joyida — ok', () => {
    const bad = buildNavPills({
      readiness: items({ workHours: false, doctorSchedule: false }),
      now,
    });
    expect(bad.branches).toEqual({ tone: 'warn', kind: 'issues', count: 2 });
    const ok = buildNavPills({ readiness: items({ workHours: true, doctorSchedule: true }), now });
    expect(ok.branches).toEqual({ tone: 'ok', kind: 'ok' });
  });

  it('Xodimlar/Xizmatlar: muammo bo‘lmasa son, bo‘lsa ogohlantirish', () => {
    const counts = buildNavPills({
      readiness: items({ staff: true, servicePrices: true }),
      usersCount: 9,
      servicesCount: 64,
      now,
    });
    expect(counts.users).toEqual({ tone: 'neutral', kind: 'count', count: 9 });
    expect(counts.services).toEqual({ tone: 'neutral', kind: 'count', count: 64 });
    const todo = buildNavPills({
      readiness: items({ staff: false, servicePrices: false }),
      usersCount: 1,
      servicesCount: 5,
      now,
    });
    expect(todo.users?.tone).toBe('warn');
    expect(todo.services).toEqual({ tone: 'warn', kind: 'no_prices' });
  });

  it('Integratsiyalar: kanal yo‘q — ogohlantirish, bor — ok', () => {
    expect(buildNavPills({ readiness: items({ channel: false }), now }).integrations).toEqual({
      tone: 'warn',
      kind: 'no_channel',
    });
    expect(buildNavPills({ readiness: items({ channel: true }), now }).integrations).toEqual({
      tone: 'ok',
      kind: 'ok',
    });
  });

  it('Litsenziya: faqat desktop; expiring/grace — ogohlantirish kunlari bilan', () => {
    expect(
      buildNavPills({
        license: { mode: 'cloud', state: 'none', daysLeft: null },
        now,
      }).license,
    ).toBeUndefined();
    expect(
      buildNavPills({
        license: { mode: 'desktop', state: 'expiring', daysLeft: 24 },
        now,
      }).license,
    ).toEqual({ tone: 'warn', kind: 'days', count: 24 });
    expect(
      buildNavPills({
        license: { mode: 'desktop', state: 'active', daysLeft: 200 },
        now,
      }).license,
    ).toEqual({ tone: 'neutral', kind: 'days', count: 200 });
  });

  it('Zaxira: 2 kundan oshsa xavf (qizil), yangi bo‘lsa ok, hech qachon — xavf', () => {
    const fresh = buildNavPills({
      backup: { mode: 'desktop', lastSuccessAt: '2026-11-12T08:00:00Z' },
      now,
    });
    expect(fresh.backup).toEqual({ tone: 'ok', kind: 'ok' });
    const stale = buildNavPills({
      backup: { mode: 'desktop', lastSuccessAt: '2026-11-09T08:00:00Z' },
      now,
    });
    expect(stale.backup).toEqual({ tone: 'danger', kind: 'days', count: 3 });
    const never = buildNavPills({ backup: { mode: 'desktop', lastSuccessAt: null }, now });
    expect(never.backup).toEqual({ tone: 'danger', kind: 'never' });
    expect(
      buildNavPills({ backup: { mode: 'cloud', lastSuccessAt: null }, now }).backup,
    ).toBeUndefined();
  });
});
