/**
 * Klient rejimida server topilmaganda fon discovery retry (CLI-348 qaror 4:
 * "Server topilmasa → tray 'Server topilmadi' + har 30s fon discovery").
 *
 * Testlanuvchanlik uchun `setInterval`/`clearInterval` to'g'ridan-to'g'ri
 * ishlatilmaydi — `scheduleInterval`/`clearScheduledInterval` chaqiruvchi
 * (`main.ts`) tomonidan inject qilinadi (`auto-updater.ts` DI konvensiyasi).
 *
 * CLI-434 — `findServer` (bitta URL, birinchi javobga sakraydi) `findServers`
 * (massiv, barcha javob) bilan almashtirildi. `onFound` endi TOPILGAN
 * SERVERLAR RO'YXATINI oladi (bitta URL emas) va HECH QANDAY avtomatik
 * ulanishni O'ZI qilmaydi — chaqiruvchi (`main.ts`) bir xil foydalanuvchi
 * tasdig'i (TOFU) oqimidan o'tkazishi shart. Bu muhim: reconnect ham amalda
 * "birinchi ulanish" (foydalanuvchi hali hech qanday serverga tasdiqlanmagan
 * holatda), shuning uchun bir xil tasdiqlash siyosatiga bo'ysunadi — aks
 * holda reconnect-loop CLI-434 evil-twin fix'ini chetlab o'tadigan yashirin
 * yo'l bo'lib qolar edi (docs/audit-fixes/CLI-434 §2a).
 */

const THIRTY_SECONDS_MS = 30000;

export interface DiscoveredServer {
  url: string;
  ip: string;
  port: number;
}

export interface ClientReconnectDeps {
  findServers: (timeoutMs?: number) => Promise<DiscoveredServer[]>;
  onFound: (servers: DiscoveredServer[]) => void;
  /**
   * FX-95 — avval tasdiqlangan (saqlangan) manzil. Berilsa har tick'da avval
   * shu tekshiriladi; javob bersa `onTrustedBack` (tasdiqlash dialogisiz —
   * manzil allaqachon TOFU orqali ishonchli) va discovery qilinmaydi.
   */
  trustedUrl?: string | null;
  checkConnection?: (url: string) => Promise<boolean>;
  onTrustedBack?: (url: string) => void;
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
    findServers,
    onFound,
    trustedUrl,
    checkConnection,
    onTrustedBack,
    intervalMs = THIRTY_SECONDS_MS,
    scheduleInterval = (fn, ms) => setInterval(fn, ms),
    clearScheduledInterval = (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  } = deps;

  let stopped = false;
  let busy = false;
  const tick = async () => {
    if (trustedUrl && checkConnection && onTrustedBack) {
      const back = await checkConnection(trustedUrl);
      if (stopped) return;
      if (back) {
        stopped = true;
        clearScheduledInterval(handle);
        onTrustedBack(trustedUrl);
        return;
      }
    }
    const servers = await findServers();
    if (stopped || servers.length === 0) return;
    stopped = true;
    clearScheduledInterval(handle);
    onFound(servers);
  };
  const handle = scheduleInterval(() => {
    if (stopped || busy) return;
    busy = true;
    void tick().finally(() => {
      busy = false;
    });
  }, intervalMs);

  return () => {
    if (stopped) return;
    stopped = true;
    clearScheduledInterval(handle);
  };
};
