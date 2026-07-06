/**
 * Klient rejimida server topilmaganda fon discovery retry (CLI-348 qaror 4:
 * "Server topilmasa → tray 'Server topilmadi' + har 30s fon discovery").
 *
 * Testlanuvchanlik uchun `setInterval`/`clearInterval` to'g'ridan-to'g'ri
 * ishlatilmaydi — `scheduleInterval`/`clearScheduledInterval` chaqiruvchi
 * (`main.ts`) tomonidan inject qilinadi (`auto-updater.ts` DI konvensiyasi).
 */

const THIRTY_SECONDS_MS = 30000;

export interface ClientReconnectDeps {
  findServer: (timeoutMs?: number) => Promise<string | null>;
  onFound: (serverUrl: string) => void;
  intervalMs?: number;
  scheduleInterval?: (fn: () => void, ms: number) => unknown;
  clearScheduledInterval?: (handle: unknown) => void;
}

/**
 * Fon discovery retry sikli ishga tushiradi va uni to'xtatuvchi funksiyani
 * qaytaradi (`app.on('before-quit', ...)` da chaqirilishi kerak — aks holda
 * interval ilova yopilgandan keyin ham fon jarayonda qolib ketadi).
 */
export const startClientReconnectLoop = (deps: ClientReconnectDeps): (() => void) => {
  const {
    findServer,
    onFound,
    intervalMs = THIRTY_SECONDS_MS,
    scheduleInterval = (fn, ms) => setInterval(fn, ms),
    clearScheduledInterval = (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  } = deps;

  let stopped = false;
  const handle = scheduleInterval(() => {
    if (stopped) return;
    void findServer().then((url) => {
      if (stopped || !url) return;
      stopped = true;
      clearScheduledInterval(handle);
      onFound(url);
    });
  }, intervalMs);

  return () => {
    if (stopped) return;
    stopped = true;
    clearScheduledInterval(handle);
  };
};
