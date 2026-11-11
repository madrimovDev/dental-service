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
const DEFAULT_CLOSE = '19:00';
/** Shu soatdan oldin (tun) — klinika yopiq, kutmasdan o'rnatiladi. */
const NIGHT_UNTIL_HOUR = 6;

/** Web `UpdateBanner` uchun IPC holati (preload `onUpdateState`). */
export interface UpdateState {
  phase: 'ready' | 'installing';
  /** ISO — rejalashtirilgan o'rnatish vaqti (phase=ready). */
  installAt: string | null;
}

/**
 * Yangilanish qachon o'rnatilishi (sof): filial yopilish vaqtidan (`HH:mm`)
 * keyin yoki tunda — hozir; ish vaqtida — bugungi yopilishda. Qabul o'rtasida
 * majburiy qayta ishga tushirish YO'Q.
 */
export const computeInstallAt = (
  now: Date,
  closeHHmm: string | null | undefined,
): { now: boolean; at: Date } => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(closeHHmm ?? '');
  const [h, min] = m ? [Number(m[1]), Number(m[2])] : [19, 0];
  const valid = h < 24 && min < 60;
  const close = new Date(now);
  close.setHours(valid ? h : 19, valid ? min : 0, 0, 0);
  if (now >= close || now.getHours() < NIGHT_UNTIL_HOUR) return { now: true, at: now };
  return { now: false, at: close };
};

export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: 'update-downloaded', listener: () => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  checkForUpdatesAndNotify(): unknown;
  quitAndInstall?(): void;
}

export interface AutoUpdaterControls {
  /** «Hozir o'rnatish» — ish vaqtida ham darhol. */
  installNow(): void;
  /** «Kechqurun» — yopilishga rejalashtirilgan holatga qaytaradi. */
  installTonight(): void;
}

export interface AutoUpdaterDeps {
  isPackaged: boolean;
  updater: UpdaterLike;
  notify: (title: string, body: string) => void;
  setTrayToolTip: (text: string) => void;
  intervalMs?: number;
  scheduleInterval?: (fn: () => void, ms: number) => void;
  now?: () => Date;
  /** Filial yopilish vaqti `HH:mm` (yo'q bo'lsa 19:00). */
  getWorkClose?: () => string | null | undefined;
  scheduleTimeout?: (fn: () => void, ms: number) => void;
  onState?: (state: UpdateState) => void;
}

export const setupAutoUpdater = (deps: AutoUpdaterDeps): AutoUpdaterControls | undefined => {
  const {
    isPackaged,
    updater,
    notify,
    setTrayToolTip,
    intervalMs = FOUR_HOURS_MS,
    scheduleInterval = (fn, ms) => {
      setInterval(fn, ms);
    },
    now = () => new Date(),
    getWorkClose = () => DEFAULT_CLOSE,
    scheduleTimeout = (fn, ms) => {
      setTimeout(fn, ms);
    },
    onState,
  } = deps;

  if (!isPackaged) return undefined; // dev rejimida o'chirilgan

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  let installing = false;
  const installNow = (): void => {
    if (installing) return;
    installing = true;
    onState?.({ phase: 'installing', installAt: null });
    updater.quitAndInstall?.();
  };

  const planInstall = (): void => {
    const plan = computeInstallAt(now(), getWorkClose());
    if (plan.now) {
      installNow();
      return;
    }
    onState?.({ phase: 'ready', installAt: plan.at.toISOString() });
    scheduleTimeout(installNow, Math.max(0, plan.at.getTime() - now().getTime()));
  };

  updater.on('update-downloaded', () => {
    setTrayToolTip('Dental Service — yangilash tayyor');
    notify('Dental Service', "🔄 Yangilash yuklab olindi. Klinika yopilgandan keyin o'rnatiladi.");
    planInstall();
  });

  updater.on('error', (err) => {
    console.error('[updater] Xato:', err.message);
  });

  // `checkForUpdatesAndNotify()` electron-updater ichida xatoni ham 'error'
  // event orqali emit qiladi, HAM promise'ni reject qiladi (ikki alohida yo'l).
  // Promise'ni catch qilmasak — Node/Electron main process'da unhandled
  // rejection default'da butun processni to'xtatadi (Node 15+ throw-by-default),
  // ya'ni update-server ishlamasa ham butun ilova (server rejimida — klinika
  // serveri) qulab tushadi. Shu uchun har chaqiruvda alohida catch qilinadi.
  const checkForUpdates = (): void => {
    Promise.resolve(updater.checkForUpdatesAndNotify()).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[updater] Xato:', message);
    });
  };

  // Darhol tekshir, keyin har 4 soatda.
  checkForUpdates();
  scheduleInterval(() => {
    checkForUpdates();
  }, intervalMs);
  return { installNow, installTonight: planInstall };
};
