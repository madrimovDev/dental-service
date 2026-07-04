/**
 * Electron `contextBridge` orqali ochilgan global — `apps/desktop/src/preload.cts`.
 * Shakl mustaqil takrorlanadi (workspace import yo'q — apps/desktop va apps/web
 * alohida TS project). O'zgartirsangiz preload.cts + settings-ipc.ts bilan
 * moslikni qo'lda saqlang.
 */
export interface DentalDesktopBridge {
  setServerUrl(serverUrl: string): Promise<{
    ok: true;
    connected: boolean;
    serverUrl: string;
  }>;
}

declare global {
  interface Window {
    dentalDesktop?: DentalDesktopBridge;
  }
}
