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
  /** UI-T3 — desktop yangilanish holati (auto-updater → UpdateBanner). Obuna bekor qilish funksiyasini qaytaradi. */
  onUpdateState?(
    cb: (state: { phase: 'ready' | 'installing'; installAt: string | null }) => void,
  ): () => void;
  installUpdateNow?(): Promise<void>;
  installUpdateTonight?(): Promise<void>;
}

declare global {
  interface Window {
    dentalDesktop?: DentalDesktopBridge;
  }
}
