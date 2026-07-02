/**
 * @dental/desktop — Electron asosiy jarayon (CLI-348, Task 9).
 *
 * Web-wrapper (CLI-251) o'rniga: `config.ts`dan rol (server/klient) o'qiladi.
 * - Server: birinchi ishga tushishda portable Postgres/Valkey setup
 *   (`first-run.ts`) → `process-manager.ts` orqali postgres+valkey+api.exe
 *   ishga tushiriladi → LAN discovery e'lon qilinadi (`discovery.ts`) → tray.
 * - Klient: LAN discovery orqali server qidiriladi → tray → brauzer oynasi
 *   serverга ulanadi.
 *
 * ⚠️ TASHQI BOG'LIQLIK (jonli, TODO):
 *   - Auto-update (electron-updater, CLI-251) — bu qayta yozishda olib
 *     tashlandi; server/klient rejimida qayta ulanishi kerak (keyingi task).
 *   - `assets/tray-icon.png` — hali repo'da yo'q, distribution paketlashda
 *     qo'shiladi.
 *   - Sozlamalar oynasi (IP qo'lda kiritish, litsenziya) — web app
 *     `/settings` sahifasiga ochiladi, alohida Electron oyna emas.
 */
import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';
import { readConfig } from './config';
import { findServer, startServerDiscovery, stopServerDiscovery } from './discovery';
import { isFirstRun, runFirstSetup, runMigrations } from './first-run';
import { startServer, stopServer } from './process-manager';
import { createTray } from './tray';

const RESOURCES = app.isPackaged
  ? process.resourcesPath
  : join(import.meta.dirname, '../../resources');
const API_EXE = join(RESOURCES, 'api.exe');

let mainWindow: BrowserWindow | null = null;

const openBrowser = (url: string): void => {
  if (mainWindow) {
    void mainWindow.loadURL(url);
    mainWindow.show();
    return;
  }
  mainWindow = new BrowserWindow({ width: 1280, height: 800, minWidth: 1024 });
  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    void shell.openExternal(u);
    return { action: 'deny' };
  });
  void mainWindow.loadURL(url);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(async () => {
  app.dock?.hide(); // macOS: dock'da ko'rsatmaydi — faqat tray

  const config = readConfig();

  if (config.role === 'server') {
    // Birinchi ishga tushish — portable Postgres initdb + conf fayllar.
    const firstRun = isFirstRun();
    if (firstRun) {
      runFirstSetup();
    }
    await startServer(config.serverPort);
    if (firstRun) {
      runMigrations(API_EXE);
    }

    const localUrl = `http://localhost:${config.serverPort}`;
    startServerDiscovery(config.serverPort);

    createTray(
      'server',
      { serverUrl: localUrl },
      {
        onOpen: () => openBrowser(localUrl),
        onSettings: () => openBrowser(`${localUrl}/settings`),
        onStop: async () => {
          stopServerDiscovery();
          await stopServer();
          app.quit();
        },
      },
    );
    openBrowser(localUrl);
  } else {
    // Klient rejimi — LAN discovery orqali server qidiriladi.
    const serverUrl = config.serverUrl || (await findServer()) || 'http://localhost';

    createTray(
      'client',
      { serverUrl },
      {
        onOpen: () => openBrowser(serverUrl),
        onSettings: () => openBrowser(`${serverUrl}/settings`),
        onStop: () => app.quit(),
      },
    );
    openBrowser(serverUrl);
  }
});

app.on('window-all-closed', () => {
  // Tray app — barcha oynalar yopilganda chiqmaymiz (server/klient tray'da ishlayveradi).
});

app.on('before-quit', async () => {
  const config = readConfig();
  if (config.role === 'server') {
    stopServerDiscovery();
    await stopServer();
  }
});
