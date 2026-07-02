/**
 * Sozlamalar IPC ko'prigi — web `/settings` sahifasi (BrowserWindow renderer,
 * `preload.ts` orqali `contextBridge`) qo'lda serverUrl kiritganda Electron
 * `config.ts` bilan bog'lanish uchun (CLI-348 qaror 5: "Sozlamalar'da
 * serverUrl qo'lda kiritish → `writeConfig()` + reconnect urinishi").
 *
 * Testlanuvchanlik uchun `electron` to'g'ridan-to'g'ri import qilinmaydi —
 * `ipcMain` chaqiruvchi (`main.ts`) tomonidan inject qilinadi (`auto-updater.ts`
 * DI konvensiyasi).
 *
 * ⚠️ Reconnect uchun `findServer()` (LAN broadcast discovery) ISHLATILMAYDI —
 * u har qanday serverni topadi, foydalanuvchi qo'lda kiritgan aniq manzilni
 * emas. Buning o'rniga to'g'ridan-to'g'ri o'sha URL'ga `GET /api/health`
 * so'rovi yuborilib erishish tekshiriladi (`checkConnection`).
 *
 * ⚠️ Follow-up (apps/web doirasi tashqarisida, shu ticket buni qurmaydi): web
 * `/settings` sahifasida `window.dentalDesktop?.setServerUrl(url)` chaqiruvi
 * hali qo'shilmagan — bu modul + `preload.ts` faqat Electron-tomon ko'prikni
 * ta'minlaydi.
 */

export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

export interface SetServerUrlResult {
  ok: true;
  connected: boolean;
  serverUrl: string;
}

export interface SettingsIpcDeps {
  ipcMain: IpcMainLike;
  writeConfig: (partial: { serverUrl: string }) => void;
  checkConnection?: (serverUrl: string) => Promise<boolean>;
  onConnected?: (serverUrl: string) => void;
}

// ⚠️ `preload.cts` bu qiymatni QAYTA E'LON QILADI (import qilmaydi — CJS
// preload ESM modulni sinxron yuklay olmaydi). Bu yerda o'zgartirsangiz
// `preload.cts`dagi nusxasini ham yangilang.
export const SET_SERVER_URL_CHANNEL = 'dental:set-server-url';

const HEALTH_CHECK_TIMEOUT_MS = 3000;

const defaultCheckConnection = async (serverUrl: string): Promise<boolean> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(`${serverUrl}/api/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

export const registerSettingsIpc = (deps: SettingsIpcDeps): void => {
  const { ipcMain, writeConfig, checkConnection = defaultCheckConnection, onConnected } = deps;

  ipcMain.handle(SET_SERVER_URL_CHANNEL, async (_event, serverUrl: unknown) => {
    const url = String(serverUrl);
    writeConfig({ serverUrl: url });
    const connected = await checkConnection(url);
    if (connected) {
      onConnected?.(url);
    }
    return { ok: true, connected, serverUrl: url } satisfies SetServerUrlResult;
  });
};
