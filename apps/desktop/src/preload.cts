/**
 * Electron preload skripti — `BrowserWindow` renderer (web app `/settings`
 * sahifasi) uchun cheklangan `contextBridge` ko'prigi (CLI-348 qaror 5).
 *
 * Faqat bitta kanalni ochadi — boshqa hech qanday Node/Electron API
 * renderer'ga sizib chiqmaydi (`contextIsolation` default yoqilgan holatga
 * mos).
 *
 * ⚠️ `.cts` kengaytma (NOT `.ts`) — paket `"type": "module"`, lekin Electron
 * `sandbox:true` (default) bilan preload skriptini CommonJS deb kutadi, ESM
 * import/export sintaksisi bilan yuklanmaydi (`SyntaxError: Cannot use
 * import statement outside a module`, real BrowserWindow'da 2026-07-02
 * topildi). `.cts` — TypeScript'ga package.json'ning "type":"module"idan
 * qat'i nazar shu FAYLNI CommonJS (`.cjs`) sifatida chiqarishni buyuradigan
 * maxsus kengaytma. Shu sabab kanal nomi `settings-ipc.ts`dan import
 * QILINMAYDI — CJS `require()` ESM modulni sinxron yuklay olmaydi; qiymat
 * shu yerda va `settings-ipc.ts`da ikkalasida ham literal saqlanadi.
 */
import { contextBridge, ipcRenderer } from 'electron';

const SET_SERVER_URL_CHANNEL = 'dental:set-server-url';

contextBridge.exposeInMainWorld('dentalDesktop', {
  setServerUrl: (serverUrl: string) => ipcRenderer.invoke(SET_SERVER_URL_CHANNEL, serverUrl),
});
