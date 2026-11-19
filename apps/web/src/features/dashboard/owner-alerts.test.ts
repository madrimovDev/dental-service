import { describe, expect, it } from 'vitest';
import { buildOwnerAlerts } from './owner-alerts';

const now = new Date('2026-11-11T10:00:00Z').getTime();
const backup = (over: object) => ({
  mode: 'desktop' as const,
  folder: 'D:\\DentalBackup',
  lastSuccessAt: null,
  lastError: null,
  files: [],
  lastRestore: null,
  ...over,
});

describe('buildOwnerAlerts', () => {
  it('cloud rejimida zaxira ogohlantirishi yo‘q', () => {
    expect(buildOwnerAlerts({ backup: { ...backup({}), mode: 'cloud' }, now })).toEqual([]);
    expect(buildOwnerAlerts({ backup: null, now })).toEqual([]);
  });

  it('zaxira >2 kun -> kritik; 2 kun ichida -> yo‘q', () => {
    const old = buildOwnerAlerts({
      backup: backup({ lastSuccessAt: '2026-11-08T08:00:00Z' }),
      now,
    });
    expect(old[0]).toMatchObject({ id: 'backup', level: 'critical', titleVars: { days: 3 } });
    expect(
      buildOwnerAlerts({ backup: backup({ lastSuccessAt: '2026-11-10T20:00:00Z' }), now }),
    ).toEqual([]);
  });

  it('zaxira hech olinmagan -> kritik', () => {
    expect(buildOwnerAlerts({ backup: backup({}), now })[0]?.titleKey).toBe(
      'ownerHome.backupNeverTitle',
    );
  });

  it('FX-147: yaqinda muvaffaqiyatsiz tiklash -> alohida ogohlantirish (lastError emas); eski -> yo‘q', () => {
    const mk = (finishedAt: string) =>
      buildOwnerAlerts({
        backup: backup({
          lastSuccessAt: '2026-11-11T08:00:00Z',
          lastRestore: {
            status: 'failed',
            file: 'dental-20261110-200000',
            finishedAt,
            error: 'boom',
            dbRolledBack: false,
          },
        }),
        now,
      });
    expect(mk('2026-11-11T09:00:00Z')).toEqual([
      expect.objectContaining({
        id: 'backup',
        level: 'critical',
        titleKey: 'ownerHome.restoreFailedTitle',
        href: '/settings',
      }),
    ]);
    expect(mk('2026-11-01T09:00:00Z')).toEqual([]);
  });

  it('litsenziya: expiring -> diqqat, grace -> kritik, active -> yo‘q', () => {
    const mk = (state: string) =>
      buildOwnerAlerts({ license: { state, daysLeft: 9, mode: 'desktop' }, now });
    expect(mk('expiring')[0]?.level).toBe('warning');
    expect(mk('grace')[0]?.level).toBe('critical');
    expect(mk('active')).toEqual([]);
  });

  it('qarz 90+ -> diqqat; darajasi bo‘yicha saralanadi', () => {
    const alerts = buildOwnerAlerts({
      debt: {
        totalDebt: 10,
        patientCount: 2,
        over90Count: 1,
        buckets: [{ key: 'd90_plus', amount: 7, patients: 1 }],
      },
      backup: backup({}),
      now,
    });
    expect(alerts.map((a) => a.id)).toEqual(['backup', 'debt']);
  });
});
