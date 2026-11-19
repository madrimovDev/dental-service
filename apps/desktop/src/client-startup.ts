/**
 * Klient rejimi startup qarori (FX-95 / LB-04). `main.ts`dan ajratilgan —
 * Electron'siz test qilinadi.
 *
 * Ilgari saqlangan (TOFU) `serverUrl` hech qanday tekshiruvsiz ochilardi:
 * server IP'si o'zgarsa (DHCP) yoki klient serverdan oldin yonsa oyna bo'sh
 * qolar, tray esa «Ulangan» derdi, qayta ulanish yo'li yo'q edi. Endi
 * saqlangan manzil avval `/api/health` bilan tekshiriladi; javob bermasa
 * oddiy discovery + foydalanuvchi tasdig'i (CLI-434) oqimiga o'tiladi, u ham
 * natija bermasa — «Server topilmadi» holati (CLI-404 prompt + 30 s fon
 * qidiruvi, saqlangan manzil ham har tick qayta tekshiriladi).
 * FX-145: manzil bilan birga server identifikatori (`/api/health` `serverId`)
 * ham pinlanadi — saqlangan IP'da boshqa server javob bersa qayta tasdiqlash.
 * Saqlangan manzil bu yerda O'CHIRILMAYDI — server keyinroq yonsa unga
 * dialogsiz qaytiladi (`client-reconnect.ts` `trustedUrl`).
 */
import type { DiscoveredServer } from './discovery.js';

/** `/api/health` javobi (yetib bo'lmasa `null`). `serverId` — FX-145. */
export interface ServerProbe {
  serverId: string | null;
}

export type ServerPinResult = { ok: true; pin: string | null } | { ok: false };

/**
 * FX-145 (LC-23) — TOFU pin qoidasi. Pin yo'q (eski klient yoki id bermaydigan
 * server) → server bergan id pinlanadi; pin bor → server AYNAN shu id'ni
 * qaytarishi shart (boshqa id yoki id yo'q = boshqa server).
 */
export const verifyServerPin = (
  pinned: string | null,
  reported: string | null,
): ServerPinResult => {
  if (pinned === null) return { ok: true, pin: reported };
  return reported === pinned ? { ok: true, pin: pinned } : { ok: false };
};

export interface ClientStartupDeps {
  trustedUrl: string | null;
  /** FX-145 — saqlangan (TOFU) server identifikatori; `null` = hali pinlanmagan. */
  pinnedServerId: string | null;
  probe: (url: string) => Promise<ServerProbe | null>;
  findServers: () => Promise<DiscoveredServer[]>;
  chooseServerUrl: (servers: DiscoveredServer[]) => Promise<string | null>;
  writeConfig: (partial: { serverUrl?: string; trustedServerId?: string | null }) => void;
  /** Saqlangan manzil javob berdi, lekin boshqa server — foydalanuvchiga xabar uchun. */
  onIdentityMismatch?: (url: string) => void;
}

export type ClientStartupResult = { kind: 'connected'; url: string } | { kind: 'not_found' };

/**
 * Saqlangan manzil yetib boriladimi VA o'sha (pinlangan) servermi. Pin
 * birinchi marta shu yerda yoziladi (eski klientlar uchun yumshoq o'tish).
 * `client-reconnect.ts` fon sikli ham shuni ishlatadi.
 */
export const checkTrustedServer = async (
  url: string,
  deps: Pick<ClientStartupDeps, 'pinnedServerId' | 'probe' | 'writeConfig' | 'onIdentityMismatch'>,
): Promise<boolean> => {
  const probe = await deps.probe(url);
  if (!probe) return false;
  const pin = verifyServerPin(deps.pinnedServerId, probe.serverId);
  if (!pin.ok) {
    deps.onIdentityMismatch?.(url);
    return false;
  }
  if (pin.pin !== deps.pinnedServerId) deps.writeConfig({ trustedServerId: pin.pin });
  return true;
};

export const resolveClientStartup = async (
  deps: ClientStartupDeps,
): Promise<ClientStartupResult> => {
  if (deps.trustedUrl && (await checkTrustedServer(deps.trustedUrl, deps))) {
    return { kind: 'connected', url: deps.trustedUrl };
  }
  const chosen = await deps.chooseServerUrl(await deps.findServers());
  if (!chosen) return { kind: 'not_found' };
  // TOFU — bir marta tasdiqlangach manzil VA server identifikatori config'ga
  // yoziladi (FX-145: identifikator noma'lum bo'lsa `null` — keyingi
  // muvaffaqiyatli health'da pinlanadi).
  const probe = await deps.probe(chosen);
  deps.writeConfig({ serverUrl: chosen, trustedServerId: probe?.serverId ?? null });
  return { kind: 'connected', url: chosen };
};

export interface LoadFailureEmitter {
  on(
    event: 'did-fail-load',
    listener: (
      event: unknown,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame: boolean,
    ) => void,
  ): unknown;
}

// Chromium net error -3 — navigatsiya bekor qilindi (yangi loadURL avvalgisini
// to'xtatganda ham keladi) — bu server yo'qligi emas.
const ERR_ABORTED = -3;

/**
 * FX-95 — asosiy freym yuklanmasa (server o'chgan/IP o'zgargan) `onFail`.
 * Prod `openBrowser` ilgari `did-fail-load`ni umuman ushlamasdi (faqat dev).
 */
export const attachLoadFailureHandler = (
  contents: LoadFailureEmitter,
  onFail: (url: string) => void,
): void => {
  contents.on('did-fail-load', (_event, errorCode, _desc, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === ERR_ABORTED) return;
    onFail(validatedURL);
  });
};
