/**
 * Single-instance qulfi — ilova bir vaqtda faqat bitta nusxada ishlaydi
 * (dizayn: docs/superpowers/specs/2026-07-06-desktop-single-instance-design.md).
 *
 * Electron'ning `app.requestSingleInstanceLock()` mexanizmi: ikkinchi nusxa
 * qulfni ololmaydi → jim chiqadi (server rejimida ikkinchi instans avval
 * postgres/valkey portlariga qayta spawn urinib xato dialogi bilan yiqilardi).
 * Birinchi nusxa `second-instance` hodisasida oynasini ko'rsatadi/fokuslaydi,
 * oyna yopiq (tray-only) bo'lsa `reopen` orqali qayta ochadi.
 *
 * Testlanuvchanlik uchun `electron` to'g'ridan-to'g'ri import qilinmaydi —
 * hammasi chaqiruvchi (`main.ts`) tomonidan inject qilinadi (`settings-ipc.ts`
 * / `auto-updater.ts` DI konvensiyasi).
 */

export interface WindowLike {
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}

export interface SingleInstanceDeps {
  requestSingleInstanceLock: () => boolean;
  quit: () => void;
  onSecondInstance: (handler: () => void) => void;
  getWindow: () => WindowLike | null;
  // Oyna yopiq (tray-only) holatda qayta ochish — main.ts oxirgi ochilgan
  // URL bilan `openBrowser`ni chaqiradi. URL hali yo'q bo'lsa (klient "server
  // topilmadi") no-op bo'lishi mumkin.
  reopen: () => void;
}

/**
 * Qulfni oladi va second-instance handler'ni ulaydi.
 * @returns `true` — bu birinchi (yagona) instans; `false` — qulf olinmadi,
 *   `quit()` chaqirildi, chaqiruvchi startup'ni davom ettirmasligi kerak.
 */
export const setupSingleInstance = (deps: SingleInstanceDeps): boolean => {
  if (!deps.requestSingleInstanceLock()) {
    deps.quit();
    return false;
  }

  deps.onSecondInstance(() => {
    const win = deps.getWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      return;
    }
    deps.reopen();
  });

  return true;
};
