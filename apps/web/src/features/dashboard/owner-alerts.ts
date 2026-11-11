import type { BackupStatus, DebtAging } from './dashboard.api';

export type OwnerAlertLevel = 'critical' | 'warning' | 'info';

export interface OwnerAlert {
  id: 'backup' | 'license' | 'debt';
  level: OwnerAlertLevel;
  titleKey: string;
  titleVars?: Record<string, string | number>;
  textKey: string;
  textVars?: Record<string, string | number>;
  ctaKey: string;
  href: string;
}

export interface OwnerAlertInput {
  backup?: BackupStatus | null;
  license?: { state: string; daysLeft: number | null; mode: string } | null;
  debt?: DebtAging | null;
  /** Ko'rsatish uchun formatlangan summa (muddati o'tgan qarz). */
  overdueDebtText?: string;
  now?: number;
}

const DAY = 86_400_000;
const BACKUP_STALE_DAYS = 2;
const LEVEL_ORDER: Record<OwnerAlertLevel, number> = { critical: 0, warning: 1, info: 2 };

/** «Siz hal qiladigan masalalar» — sof funksiya, darajasi bo'yicha saralangan. */
export function buildOwnerAlerts(input: OwnerAlertInput): OwnerAlert[] {
  const now = input.now ?? Date.now();
  const out: OwnerAlert[] = [];

  const b = input.backup;
  if (b && b.mode === 'desktop') {
    if (b.lastError) {
      out.push({
        id: 'backup',
        level: 'warning',
        titleKey: 'ownerHome.backupErrorTitle',
        textKey: 'ownerHome.backupText',
        ctaKey: 'ownerHome.backupCta',
        href: '/settings',
      });
    }
    const last = b.lastSuccessAt ? new Date(b.lastSuccessAt).getTime() : null;
    const days = last == null ? null : Math.floor((now - last) / DAY);
    if (days == null || days > BACKUP_STALE_DAYS) {
      out.push({
        id: 'backup',
        level: 'critical',
        titleKey: days == null ? 'ownerHome.backupNeverTitle' : 'ownerHome.backupStaleTitle',
        titleVars: days == null ? undefined : { days },
        textKey: 'ownerHome.backupText',
        ctaKey: 'ownerHome.backupCta',
        href: '/settings',
      });
    }
  }

  const l = input.license;
  if (l && l.mode === 'desktop' && l.daysLeft != null) {
    if (l.state === 'grace' || l.state === 'expiring') {
      out.push({
        id: 'license',
        level: l.state === 'grace' ? 'critical' : 'warning',
        titleKey: l.state === 'grace' ? 'ownerHome.licenseGraceTitle' : 'ownerHome.licenseTitle',
        titleVars: { count: l.daysLeft },
        textKey: 'ownerHome.licenseText',
        ctaKey: 'ownerHome.licenseCta',
        href: '/settings',
      });
    }
  }

  const d = input.debt;
  if (d && d.over90Count > 0) {
    const over = d.buckets.find((x) => x.key === 'd90_plus')?.amount ?? 0;
    out.push({
      id: 'debt',
      level: 'warning',
      titleKey: 'ownerHome.debtTitle',
      titleVars: { count: d.over90Count },
      textKey: 'ownerHome.debtText',
      textVars: { amount: input.overdueDebtText ?? String(over) },
      ctaKey: 'ownerHome.debtCta',
      href: '/reports',
    });
  }

  // Backup'ning ikki holati bir vaqtda bo'lsa — eng og'iri (critical) qoladi.
  const seen = new Set<string>();
  return out
    .sort((a, b2) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b2.level])
    .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
}
