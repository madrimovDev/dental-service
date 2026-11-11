import { BackupSettingsSection } from './BackupSettingsSection';
import { SettingsShell } from './SettingsShell';

/** Sozlamalar → Zaxira nusxa (faqat desktop; bulutda bo'lim chizilmaydi). */
export function BackupSettingsScreen() {
  return (
    <SettingsShell active="backup">
      <BackupSettingsSection />
    </SettingsShell>
  );
}
