import { useLicenseStatus } from '@/features/license/license.api';
import { useServices } from '@/features/services/services.api';
import { useBackupStatus } from './backup.api';
import { useUsers } from './settings.api';
import { buildNavPills, type NavPill } from './settings.navPills';
import type { ReadinessKey } from './settings.readiness.api';

/**
 * Sozlamalar chap navigatsiyasi uchun ma'lumot: belgilar + desktop-faqat bo'limlar ko'rinishi.
 * So'rovlar faqat ruxsat/rejim bo'lsa yuboriladi (keraksiz 403 shovqini yo'q).
 */
export function useSettingsNavData(
  readiness: { key: ReadinessKey; ok: boolean }[],
  hasPermission: (code: string) => boolean,
): { pills: Record<string, NavPill | undefined>; showLicense: boolean; showBackup: boolean } {
  const isDesktopBackup = readiness.some((i) => i.key === 'backup');
  const users = useUsers({ enabled: hasPermission('user.view') });
  const services = useServices({ enabled: hasPermission('service.view') });
  const license = useLicenseStatus();
  const backup = useBackupStatus({ enabled: isDesktopBackup });

  const licenseData = license.data;
  const backupData = backup.data;
  const pills = buildNavPills({
    readiness,
    usersCount: users.data ? new Set(users.data.map((a) => a.userId)).size : undefined,
    servicesCount: services.data ? services.data.filter((s) => s.isActive).length : undefined,
    license: licenseData
      ? { mode: licenseData.mode, state: licenseData.state, daysLeft: licenseData.daysLeft }
      : undefined,
    backup: backupData
      ? { mode: backupData.mode, lastSuccessAt: backupData.lastSuccessAt ?? null }
      : undefined,
    now: new Date(),
  });
  return {
    pills,
    showLicense: licenseData?.mode === 'desktop',
    showBackup: isDesktopBackup,
  };
}
