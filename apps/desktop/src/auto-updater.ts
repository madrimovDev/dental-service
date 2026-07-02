/**
 * Auto-updater — fon rejimida yangilanish tekshiruvi + tray bildirishnoma
 * (CLI-357, Task 12).
 *
 * `electron-updater` generic provider orqali `UPDATE_URL` (build-time env,
 * `electron-builder.yml`) manzilidan yangilanish tekshiradi. Fon da
 * avtomatik yuklaydi (`autoDownload`); yuklab bo'lgach tray tooltip +
 * native bildirishnoma ko'rsatiladi, o'rnatish esa ilova keyingi marta
 * yopilganda amalga oshadi (`autoInstallOnAppQuit`). Faqat packaged
 * build'da ishlaydi — dev rejimida o'chirilgan.
 *
 * Testlanuvchanlik uchun `electron-updater`/`electron` to'g'ridan-to'g'ri
 * import qilinmaydi — barcha tashqi effektlar (`updater`, `notify`,
 * `setTrayToolTip`, `scheduleInterval`) chaqiruvchi (`main.ts`) tomonidan
 * inject qilinadi (factory DI konvensiyasi).
 */

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: 'update-downloaded', listener: () => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  checkForUpdatesAndNotify(): unknown;
}

export interface AutoUpdaterDeps {
  isPackaged: boolean;
  updater: UpdaterLike;
  notify: (title: string, body: string) => void;
  setTrayToolTip: (text: string) => void;
  intervalMs?: number;
  scheduleInterval?: (fn: () => void, ms: number) => void;
}

export const setupAutoUpdater = (deps: AutoUpdaterDeps): void => {
  const {
    isPackaged,
    updater,
    notify,
    setTrayToolTip,
    intervalMs = FOUR_HOURS_MS,
    scheduleInterval = (fn, ms) => {
      setInterval(fn, ms);
    },
  } = deps;

  if (!isPackaged) return; // dev rejimida o'chirilgan

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  updater.on('update-downloaded', () => {
    setTrayToolTip('Dental Service — yangilash tayyor');
    notify('Dental Service', "🔄 Yangilash yuklab olindi. Keyingi ishga tushirishda o'rnatiladi.");
  });

  updater.on('error', (err) => {
    console.error('[updater] Xato:', err.message);
  });

  // Darhol tekshir, keyin har 4 soatda.
  updater.checkForUpdatesAndNotify();
  scheduleInterval(() => {
    updater.checkForUpdatesAndNotify();
  }, intervalMs);
};
