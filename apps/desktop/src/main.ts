/**
 * @dental/desktop — Electron asosiy jarayon (V3-3, CLI-251).
 *
 * Web ilovani (apps/web) wrap qiladi (CLAUDE.md §3.5 — yagona React codebase).
 * - DEV: Vite dev-serverni yuklaydi (http://localhost:8000).
 * - PROD: `DESKTOP_WEB_URL` (deploy qilingan web) yuklaydi.
 *
 * ⚠️ TASHQI BOG'LIQLIK (jonli, TODO):
 *   - Code-signing sertifikat (macOS Developer / Windows) — imzo'siz local build ishlaydi,
 *     lekin distribution uchun imzo kerak.
 *   - Auto-update publish provideri (S3/CDN/GitHub releases) — `electron-builder.yml` `publish`.
 */
import { app, BrowserWindow, shell } from 'electron';
import { autoUpdater } from 'electron-updater';

const isDev = !app.isPackaged;
const WEB_URL = isDev
  ? 'http://localhost:8000'
  : (process.env.DESKTOP_WEB_URL ?? 'http://localhost:8000');

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Dental Service',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Tashqi linklar default brauzerda ochiladi (Electron oynasida emas).
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  void win.loadURL(WEB_URL);
}

app.whenReady().then(() => {
  createWindow();

  // Auto-update — faqat packaged build'da (TODO: publish provider + imzo).
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[desktop] auto-update tekshiruvi muvaffaqiyatsiz:', err);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // macOS'dan tashqari — barcha oynalar yopilganda chiqamiz.
  if (process.platform !== 'darwin') app.quit();
});
