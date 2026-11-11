import type { ReadinessKey } from './settings.readiness.api';

/**
 * Sozlamalar chap navigatsiyasi holat belgilari (Settings kanvas): har bo'lim yonida
 * matnli belgi — rang yolg'iz emas (✓ / «1 muammo» / «3 kun» / son). Sof funksiya.
 */
export type PillTone = 'ok' | 'neutral' | 'warn' | 'danger';
export type NavPill =
  | { tone: PillTone; kind: 'ok' }
  | { tone: PillTone; kind: 'count'; count: number }
  | { tone: PillTone; kind: 'issues'; count: number }
  | { tone: PillTone; kind: 'days'; count: number }
  | { tone: PillTone; kind: 'no_prices' }
  | { tone: PillTone; kind: 'no_channel' }
  | { tone: PillTone; kind: 'never' }
  | { tone: PillTone; kind: 'todo' };

export type NavPillInput = {
  readiness?: { key: ReadinessKey; ok: boolean }[];
  usersCount?: number;
  servicesCount?: number;
  license?: { mode: string; state: string; daysLeft: number | null };
  backup?: { mode: string; lastSuccessAt: string | null };
  now: Date;
};

/** >2 kun zaxirasiz — xavf (roadmap §4.1, BackupSettingsSection bilan bir xil). */
const BACKUP_STALE_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

export function buildNavPills(input: NavPillInput): Record<string, NavPill | undefined> {
  const out: Record<string, NavPill | undefined> = {};
  const r = input.readiness;
  const todo = (...keys: ReadinessKey[]) =>
    (r ?? []).filter((i) => keys.includes(i.key) && !i.ok).length;
  const has = (...keys: ReadinessKey[]) => (r ?? []).some((i) => keys.includes(i.key));

  if (has('workHours', 'doctorSchedule')) {
    const n = todo('workHours', 'doctorSchedule');
    out.branches = n > 0 ? { tone: 'warn', kind: 'issues', count: n } : { tone: 'ok', kind: 'ok' };
  }

  if (has('staff') && todo('staff') > 0) {
    out.users = { tone: 'warn', kind: 'issues', count: 1 };
  } else if (input.usersCount !== undefined) {
    out.users = { tone: 'neutral', kind: 'count', count: input.usersCount };
  }

  if (todo('servicePrices') > 0) {
    out.services = { tone: 'warn', kind: 'no_prices' };
  } else if (input.servicesCount !== undefined) {
    out.services = { tone: 'neutral', kind: 'count', count: input.servicesCount };
  }

  if (has('channel')) {
    out.integrations =
      todo('channel') > 0 ? { tone: 'warn', kind: 'no_channel' } : { tone: 'ok', kind: 'ok' };
  }

  const lic = input.license;
  if (lic && lic.mode === 'desktop' && lic.daysLeft != null) {
    const expiring = lic.state === 'expiring' || lic.state === 'grace';
    out.license = { tone: expiring ? 'warn' : 'neutral', kind: 'days', count: lic.daysLeft };
  }

  const bk = input.backup;
  if (bk && bk.mode === 'desktop') {
    if (!bk.lastSuccessAt) {
      out.backup = { tone: 'danger', kind: 'never' };
    } else {
      const days = Math.floor(
        (input.now.getTime() - new Date(bk.lastSuccessAt).getTime()) / DAY_MS,
      );
      out.backup =
        days > BACKUP_STALE_DAYS
          ? { tone: 'danger', kind: 'days', count: days }
          : { tone: 'ok', kind: 'ok' };
    }
  }
  return out;
}
