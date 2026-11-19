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
 * Saqlangan manzil bu yerda O'CHIRILMAYDI — server keyinroq yonsa unga
 * dialogsiz qaytiladi (`client-reconnect.ts` `trustedUrl`).
 */
import type { DiscoveredServer } from './discovery.js';

export interface ClientStartupDeps {
  trustedUrl: string | null;
  checkConnection: (url: string) => Promise<boolean>;
  findServers: () => Promise<DiscoveredServer[]>;
  chooseServerUrl: (servers: DiscoveredServer[]) => Promise<string | null>;
  writeConfig: (partial: { serverUrl: string }) => void;
}

export type ClientStartupResult = { kind: 'connected'; url: string } | { kind: 'not_found' };

export const resolveClientStartup = async (
  deps: ClientStartupDeps,
): Promise<ClientStartupResult> => {
  if (deps.trustedUrl && (await deps.checkConnection(deps.trustedUrl))) {
    return { kind: 'connected', url: deps.trustedUrl };
  }
  const chosen = await deps.chooseServerUrl(await deps.findServers());
  if (!chosen) return { kind: 'not_found' };
  // TOFU — bir marta tasdiqlangach config'ga yoziladi.
  deps.writeConfig({ serverUrl: chosen });
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
