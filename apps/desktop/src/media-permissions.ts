/**
 * FT-06 — Electron brauzer ruxsatlari (kamera).
 *
 * `session.setPermissionRequestHandler` o'rnatilgach Electron'ning "hammasiga
 * ruxsat" standarti o'chadi: FAQAT asosiy oynaning ilova origin'idan kelgan
 * `media` (faqat VIDEO — mikrofon kerak emas) so'rovi qabul qilinadi, qolgan
 * hamma ruxsat (geolocation, notifications, display-capture, clipboard, ...)
 * rad etiladi. Sof mantiq alohida fayl — `electron` import qilmaydi, `bun test`
 * bilan sinaladi; `main.ts` faqat `installMediaPermissionHandlers`ni chaqiradi.
 */

const originOf = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    const u = new URL(url);
    // file:/about:/data: origin'lari "null" — ilova origin'i bo'la olmaydi.
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
};

const sameAppOrigin = (candidate: string | null | undefined, appUrl: string | null): boolean => {
  const app = originOf(appUrl);
  const cand = originOf(candidate);
  return app !== null && cand !== null && app === cand;
};

export const isAllowedMediaRequest = (input: {
  permission: string;
  requestingUrl: string | undefined;
  appUrl: string | null;
  mediaTypes: readonly string[] | undefined;
  isMainFrame?: boolean;
}): boolean => {
  if (input.permission !== 'media') return false;
  if (input.isMainFrame === false) return false;
  const types = input.mediaTypes;
  if (!types || types.length === 0) return false;
  if (types.some((t) => t !== 'video')) return false; // audio — rad
  return sameAppOrigin(input.requestingUrl, input.appUrl);
};

/** `setPermissionCheckHandler` (enumerateDevices va h.k.) — `mediaType`: video|audio|unknown. */
export const isAllowedMediaCheck = (input: {
  permission: string;
  requestingOrigin: string | undefined;
  appUrl: string | null;
  mediaType: string | undefined;
}): boolean => {
  if (input.permission !== 'media') return false;
  if (input.mediaType === 'audio') return false;
  return sameAppOrigin(input.requestingOrigin, input.appUrl);
};

type Details = object;

export interface PermissionSessionLike {
  setPermissionRequestHandler(
    handler:
      | ((
          webContents: unknown,
          permission: string,
          callback: (granted: boolean) => void,
          details: Details,
        ) => void)
      | null,
  ): void;
  setPermissionCheckHandler(
    handler:
      | ((
          webContents: unknown,
          permission: string,
          requestingOrigin: string,
          details: Details,
        ) => boolean)
      | null,
  ): void;
}

export interface MediaPermissionDeps {
  /** Faqat asosiy ilova oynasi (sozlamalar/prompt oynalari emas). */
  isMainContents: (webContents: unknown) => boolean;
  /** Asosiy oyna yuklagan ilova URL'i (server manzili). */
  getAppUrl: () => string | null;
}

export const installMediaPermissionHandlers = (
  ses: PermissionSessionLike,
  deps: MediaPermissionDeps,
): void => {
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const granted =
      deps.isMainContents(webContents) &&
      isAllowedMediaRequest({
        permission,
        requestingUrl: (details as Record<string, unknown>).requestingUrl as string | undefined,
        appUrl: deps.getAppUrl(),
        mediaTypes: (details as Record<string, unknown>).mediaTypes as string[] | undefined,
        isMainFrame: (details as Record<string, unknown>).isMainFrame as boolean | undefined,
      });
    callback(granted);
  });
  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    return (
      deps.isMainContents(webContents) &&
      isAllowedMediaCheck({
        permission,
        requestingOrigin,
        appUrl: deps.getAppUrl(),
        mediaType: (details as Record<string, unknown>).mediaType as string | undefined,
      })
    );
  });
};

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * FT-06.1 — klient rejimida asosiy oyna serverni `http://<LAN-IP>:8080` dan
 * yuklaydi. Bu secure context EMAS → Chromium `navigator.mediaDevices`ni
 * umuman bermaydi (kamera «qo'llab-quvvatlanmaydi»). Ishga tushishda (app
 * `ready`dan OLDIN) shu origin `unsafely-treat-insecure-origin-as-secure`
 * switch'iga beriladi. Qiymat faqat klient + `http:` + loopback bo'lmagan
 * yaroqli manzil uchun qaytadi; server roli localhost'ni yuklaydi (allaqachon
 * secure), https — kerak emas. Switch ishga tushishda o'qiladi: TOFU/discovery
 * manzilni o'zgartirsa, kamera ilova qayta ochilgandan keyin ishlaydi.
 */
export const insecureOriginToTreatAsSecure = (config: {
  role: string;
  serverUrl: string | null | undefined;
}): string | null => {
  if (config.role !== 'client' || !config.serverUrl) return null;
  let u: URL;
  try {
    u = new URL(config.serverUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:') return null;
  if (LOOPBACK_HOSTS.has(u.hostname)) return null;
  // Switch qiymati vergul bilan ajratilgan ro'yxat — boshqa origin qo'shilib qolmasin.
  if (/[\s,]/.test(u.origin)) return null;
  return u.origin;
};
