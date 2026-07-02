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
 * Auto-update — `electron-updater` generic provider orqali `UPDATE_URL`
 * (build-time env, `electron-builder.yml`) manzilidan tekshiradi
 * (`auto-updater.ts`, CLI-357, Task 12); faqat packaged build'da ishlaydi.
 *
 * Klient — server topilmasa (`serverUrl` config'da yo'q va `findServer()`
 * `null` qaytarsa) tray "Server topilmadi" holatini ko'rsatadi va
 * `client-reconnect.ts` orqali har 30s fon da qayta discovery urinadi
 * (CLI-348 qaror 4). Server topilganda YOKI foydalanuvchi `/settings`
 * sahifasida (`preload.ts` → `settings-ipc.ts`, CLI-348 qaror 5) qo'lda
 * serverUrl kiritib muvaffaqiyatli ulansa — tray/brauzer yangi manzilga
 * o'tadi (`updateTray`, YANGI `createTray` emas — bitta tray ikonkasi).
 *
 * Server — litsenziya faollashtirilmagan bo'lsa (`.lic` fayl yo'q,
 * `license-status.ts` — existence-only, muddat tekshiruvi API tomonida)
 * brauzer asosiy UI o'rniga `/activate`ga ochiladi (CLI-348 qaror 1; web
 * `/activate` sahifasining o'zi hali qurilmagan — follow-up, apps/web
 * doirasi tashqarisida).
 *
 * ⚠️ TASHQI BOG'LIQLIK (jonli, TODO):
 *   - `assets/tray-icon.png` — hali repo'da yo'q, distribution paketlashda
 *     qo'shiladi.
 *   - `preload.ts` ESM (`"type": "module"`) sifatida kompilyatsiya qilinadi —
 *     `sandbox`/Electron versiyasiga bog'liq yuklash xatti-harakati real
 *     BrowserWindow'da hali tekshirilmagan (web `/settings` bu ko'prikni
 *     hali chaqirmagani sabab hozircha bloklovchi emas).
 *   - Web `/settings` sahifasi `window.dentalDesktop?.setServerUrl(url)`ni
 *     hali chaqirmaydi (apps/web o'zgarishi shu ticket doirasi tashqarisida).
 */
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { setupAutoUpdater } from './auto-updater';
import { startClientReconnectLoop } from './client-reconnect';
import { readConfig, writeConfig } from './config';
import { findServer, startServerDiscovery, stopServerDiscovery } from './discovery';
import { isFirstRun, runFirstSetup, runMigrations } from './first-run';
import { hasLicense } from './license-status';
import { startServer, stopServer } from './process-manager';
import { registerSettingsIpc } from './settings-ipc';
import { createTray, setTrayToolTip, updateTray } from './tray';

const PRELOAD_PATH = join(import.meta.dirname, 'preload.js');

const RESOURCES = app.isPackaged
  ? process.resourcesPath
  : join(import.meta.dirname, '../../resources');
const API_EXE = join(RESOURCES, 'api.exe');

// process-manager.ts/first-run.ts konvensiyasi bilan bir xil default (CLI-346
// qarori: xato dialogida foydalanuvchiga ko'rsatiladigan log yo'li).
const LOGS_DIR = join(
  process.env.DENTAL_DATA_DIR ||
    (process.platform === 'win32' ? 'C:\\ProgramData\\DentalService' : '/var/lib/dental-service'),
  'logs',
);

let mainWindow: BrowserWindow | null = null;
// Klient rejimida server topilmaganda ishga tushirilgan fon retry sikli
// to'xtatuvchisi — server topilganda yoki ilova yopilganda tozalanadi
// (CLI-348 qaror 4).
let stopClientReconnectLoop: (() => void) | null = null;

const openBrowser = (url: string): void => {
  if (mainWindow) {
    void mainWindow.loadURL(url);
    mainWindow.show();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    webPreferences: { preload: PRELOAD_PATH },
  });
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
    // Postgres/Valkey/api.exe spawn yoki migration muvaffaqiyatsiz bo'lsa
    // (binary topilmadi, timeout) — `Error` throw qilinadi (CLI-346);
    // foydalanuvchi jim qolgan ilova bilan chalkashmasin deb modal dialog
    // ko'rsatib chiqamiz (CLI-346 qarori: "Task 7 bilan birga").
    try {
      const firstRun = isFirstRun();
      if (firstRun) {
        runFirstSetup();
      }
      await startServer(config.serverPort);
      if (firstRun) {
        runMigrations(API_EXE);
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      dialog.showErrorBox(
        'Dental Service — ishga tushmadi',
        `Server komponentlari ishga tushmadi: ${detail}\n\nLoglarni ko'ring: ${LOGS_DIR}`,
      );
      app.quit();
      return;
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
    // Litsenziya faollashtirilmagan bo'lsa (`.lic` fayl yo'q) — asosiy UI
    // o'rniga aktivatsiya sahifasi ochiladi (CLI-348 qaror 1). Web app
    // `/activate` sahifasi hali qurilmagan (follow-up, apps/web doirasi
    // tashqarisida) — bu yerda faqat desktop-tomon signal+redirect ulanadi.
    openBrowser(hasLicense() ? localUrl : `${localUrl}/activate`);
  } else {
    // Klient rejimi — LAN discovery orqali server qidiriladi.
    const serverUrl = config.serverUrl || (await findServer());

    const connectedCallbacks = (url: string) => ({
      onOpen: () => openBrowser(url),
      onSettings: () => openBrowser(`${url}/settings`),
      onStop: () => app.quit(),
    });

    // Sozlamalar'da (web `/settings`, `preload.ts` orqali) qo'lda kiritilgan
    // serverUrl — `writeConfig()` + reconnect urinishi (CLI-348 qaror 5).
    // Muvaffaqiyatli ulansa tray/brauzer yangi manzilga o'tadi, joriy fon
    // discovery retry (bo'lsa) to'xtatiladi.
    registerSettingsIpc({
      ipcMain,
      writeConfig,
      onConnected: (url) => {
        stopClientReconnectLoop?.();
        stopClientReconnectLoop = null;
        updateTray('client', { serverUrl: url }, connectedCallbacks(url));
        openBrowser(url);
      },
    });

    if (serverUrl) {
      createTray('client', { serverUrl }, connectedCallbacks(serverUrl));
      openBrowser(serverUrl);
    } else {
      // Server topilmadi — tray "Server topilmadi" holatini ko'rsatadi va
      // har 30s fon da qayta discovery urinadi (CLI-348 qaror 4). Topilgach
      // `updateTray` chaqiriladi — YANGI `createTray` emas, aks holda ikkinchi
      // tray ikonkasi yaratilib qoladi.
      createTray(
        'client',
        { serverUrl: '', serverFound: false },
        {
          onOpen: () => {},
          onSettings: () => {},
          onStop: () => {
            stopClientReconnectLoop?.();
            app.quit();
          },
        },
      );
      stopClientReconnectLoop = startClientReconnectLoop({
        findServer,
        onFound: (found) => {
          stopClientReconnectLoop = null;
          updateTray('client', { serverUrl: found }, connectedCallbacks(found));
          openBrowser(found);
        },
      });
    }
  }

  setupAutoUpdater({
    isPackaged: app.isPackaged,
    updater: autoUpdater,
    notify: (title, body) => new Notification({ title, body }).show(),
    setTrayToolTip,
  });
});

app.on('window-all-closed', () => {
  // Tray app — barcha oynalar yopilganda chiqmaymiz (server/klient tray'da ishlayveradi).
});

app.on('before-quit', async () => {
  const config = readConfig();
  if (config.role === 'server') {
    stopServerDiscovery();
    await stopServer();
  } else {
    stopClientReconnectLoop?.();
    stopClientReconnectLoop = null;
  }
});
