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

export type SetServerUrlResult =
  | { ok: true; connected: boolean; serverUrl: string }
  | { ok: false; code: string };

export interface SettingsIpcDeps {
  ipcMain: IpcMainLike;
  writeConfig: (partial: { serverUrl: string }) => void;
  checkConnection?: (serverUrl: string) => Promise<boolean>;
  onConnected?: (serverUrl: string) => void;
}

export interface ValidateServerUrlResult {
  ok: boolean;
  url?: string;
  code?: string;
}

const isPrivateIPv4 = (host: string): boolean => {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1, 5).map(Number);
  if (octets.some((n) => n < 0 || n > 255)) return false;
  const [a, b] = octets as [number, number, number, number];
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  return false;
};

const isAllowedHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  if (host === 'localhost') return true;
  if (host.endsWith('.local')) return true; // mDNS server names (e.g. dental-service.local)
  return isPrivateIPv4(host);
};

/**
 * CLI-434 — evil-twin fix (b). `serverUrl` (whether from LAN discovery
 * confirmation or manual `/settings` entry) is validated BEFORE it's ever
 * persisted (`writeConfig`) or health-checked: only `http(s)://` scheme +
 * a LAN/localhost/.local host is accepted. `file:`/`javascript:`/`data:` and
 * public hosts are rejected — a rogue public URL never even reaches
 * `checkConnection` (health-check happens strictly after validation passes).
 * Sof funksiya — unit-testable without Electron/network.
 */
export const validateServerUrl = (raw: unknown): ValidateServerUrlResult => {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, code: 'INVALID_URL' };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, code: 'INVALID_URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, code: 'INVALID_URL' };
  }
  if (!isAllowedHost(parsed.hostname)) {
    return { ok: false, code: 'INVALID_URL' };
  }
  // Raw string returned as-is (not `parsed.toString()`) — URL normalization
  // (e.g. adding a trailing `/`) would silently rewrite what the user typed
  // or what discovery reported; validation, not reformatting.
  return { ok: true, url: raw };
};

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
    const validation = validateServerUrl(serverUrl);
    if (!validation.ok || !validation.url) {
      // CLI-434 — invalid scheme/host: writeConfig is NOT called (no rogue
      // URL ever persisted) and checkConnection is never reached (no
      // health-check request goes out to a public/attacker host either).
      return { ok: false, code: validation.code ?? 'INVALID_URL' } satisfies SetServerUrlResult;
    }
    const url = validation.url;
    writeConfig({ serverUrl: url });
    const connected = await checkConnection(url);
    if (connected) {
      onConnected?.(url);
    }
    return { ok: true, connected, serverUrl: url } satisfies SetServerUrlResult;
  });
};
