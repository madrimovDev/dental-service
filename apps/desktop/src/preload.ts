/**
 * Electron preload skripti — `BrowserWindow` renderer (web app `/settings`
 * sahifasi) uchun cheklangan `contextBridge` ko'prigi (CLI-348 qaror 5).
 *
 * Faqat `settings-ipc.ts`dagi bitta kanalni ochadi — boshqa hech qanday
 * Node/Electron API renderer'ga sizib chiqmaydi (`contextIsolation` default
 * yoqilgan holatga mos).
 *
 * ⚠️ Follow-up (apps/web doirasi tashqarisida): web `/settings` sahifasi hali
 * `window.dentalDesktop?.setServerUrl(url)`ni chaqirmaydi — bu faqat
 * Electron-tomon ko'prikni tayyorlaydi.
 *
 * ⚠️ Runtime eslatma: paket `"type": "module"` — tsc bu faylni ESM
 * (`dist/preload.js`) sifatida chiqaradi. Electron `sandbox:true` bilan CJS
 * preload kutadi; ESM preload'ni yuklash uchun `sandbox:false` yoki Electron
 * versiyasiga mos qo'shimcha sozlash kerak bo'lishi mumkin — real
 * BrowserWindow'da tekshirilmagan (web UI hali chaqirmagani sabab hozircha
 * bloklovchi emas), packaging bosqichida tasdiqlansin.
 */
import { contextBridge, ipcRenderer } from 'electron';
import { SET_SERVER_URL_CHANNEL } from './settings-ipc.js';

contextBridge.exposeInMainWorld('dentalDesktop', {
  setServerUrl: (serverUrl: string) => ipcRenderer.invoke(SET_SERVER_URL_CHANNEL, serverUrl),
});
