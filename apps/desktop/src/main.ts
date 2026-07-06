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
 * `/activate` sahifasi qurilgan va `auth.routes.tsx`da ro'yxatdan o'tgan —
 * `apps/web/src/features/auth/pages/activate.page.tsx` (commit 7670124,
 * "feat: end-to-end desktop license activation flow")).
 *
 * 📌 DOIMIY CHEKLOV: `preload.cjs` CommonJS bo'lib qolishi SHART
 *   (`.cts`dan kompilyatsiya, `sandbox:true` talabi — ESM emas). Bu talab
 *   real BrowserWindow'da tekshirilgan: shu yerda topilgan CSP + preload
 *   ESM/CJS blank-screen xatosi tuzatilgan (commit 165ddc5, "fix(desktop):
 *   blank screen in real BrowserWindow (CSP + preload ESM)"). `preload.ts`ni
 *   ESM'ga o'tkazish shu bug'ni qaytaradi.
 */
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import electronUpdater from 'electron-updater';
import { setupAutoUpdater } from './auto-updater.js';
import { startClientReconnectLoop } from './client-reconnect.js';
import { readConfig, writeConfig } from './config.js';
import { findServer, startServerDiscovery, stopServerDiscovery } from './discovery.js';
import { isFirstRun, runFirstSetup, runMigrations } from './first-run.js';
import { hasLicense } from './license-status.js';
import {
  getApiCommand,
  startApiLayer,
  startDatabaseLayer,
  startServer,
  stopServer,
} from './process-manager.js';
import { registerSettingsIpc } from './settings-ipc.js';
import { setupSingleInstance } from './single-instance.js';
import { createTray, setTrayToolTip, updateTray } from './tray.js';

// `electron-updater`ning `autoUpdater` eksporti runtime'da lazy getter orqali
// aniqlanadi (platform-conditional) — cjs-module-lexer buni statik named
// export sifatida ko'ra olmaydi, Node ESM `SyntaxError` beradi. Standart
// interop: default import + destructure.
const { autoUpdater } = electronUpdater;

// `.cjs` — `preload.cts` (CommonJS, sandbox:true talabi; ESM emas, izohiga qarang).
const PRELOAD_PATH = join(import.meta.dirname, 'preload.cjs');

// Platform-mos yo'l — process-manager.ts'ning `getApiCommand()`i bilan bir
// xil (yagona manba, ikki joyda alohida-alohida .exe/bare-nom mantiq
// takrorlanmasin).
const API_EXE = getApiCommand();

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

// Dev rejimi — `!app.isPackaged` (process-manager.ts/first-run.ts bilan bir
// xil konvensiya). Portable Postgres/Valkey/api.exe (Task 7) faqat Windows
// uchun paketlangan — Linux/macOS'da dasturchi ustida ishlaydi va bu binarylar
// yo'q, shuning uchun process-manager/first-run/discovery chetlab o'tiladi:
// Electron oddiy allaqachon ishlab turgan Vite dev-server'ni (`bun dev` /
// `turbo dev` — web:8000, /api'ni 8001ga proxy qiladi) o'raydi, xuddi eski
// web-wrapper (CLI-251) kabi. Litsenziya tekshiruvi (CLI-348 qaror 1) esa
// productionga o'xshab DEV'DA HAM ishlaydi — `hasLicense()` faqat fayl
// mavjudligini tekshiradi (platform-agnostik, hech qanday Windows binary
// kerak emas), shuning uchun uni dev'da chetlab o'tishning hojati yo'q.
//
// `DENTAL_FORCE_PROD_FLOW=true` — real NSIS/AppImage paketlashsiz, to'liq
// server/client oqimini (process-manager+first-run+discovery+tray) haqiqiy
// binary bilan sinash uchun (2026-07-02, CLI-338 runtime-verify). Faqat
// qo'lda o'rnatilganda ishlaydi — oddiy `bun run dev` xulqi o'zgarmaydi.
const isDevWrapMode = (): boolean =>
  !app.isPackaged && process.env.DENTAL_FORCE_PROD_FLOW !== 'true';

const DEV_URL = process.env.DENTAL_DEV_URL ?? 'http://localhost:8000';

const openDevWindow = (): void => {
  const target = hasLicense() ? DEV_URL : `${DEV_URL}/activate`;
  openBrowser(target);
  mainWindow?.webContents.openDevTools({ mode: 'detach' });
  // `turbo dev --parallel` bilan Electron web dev-serverdan oldin ochilishi
  // mumkin — bir marta 1s dan keyin qayta yuklab ko'ramiz.
  mainWindow?.webContents.once('did-fail-load', () => {
    setTimeout(() => void mainWindow?.loadURL(target), 1000);
  });
};

// Ikkinchi nusxa ishga tushirilganda oyna yopiq (tray-only) bo'lsa qayta
// ochish uchun oxirgi ochilgan URL (single-instance.ts `reopen`).
let lastOpenedUrl: string | null = null;

const openBrowser = (url: string): void => {
  lastOpenedUrl = url;
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

// Single-instance qulfi — ikkinchi nusxa jim chiqadi, birinchi nusxaning
// oynasi ko'rsatiladi/fokuslanadi (spec: 2026-07-06-desktop-single-instance).
// Server rejimida ayniqsa muhim: ikkinchi instans avval postgres/valkey
// portlariga qayta spawn urinib xato dialogi bilan yiqilardi.
const isPrimaryInstance = setupSingleInstance({
  requestSingleInstanceLock: () => app.requestSingleInstanceLock(),
  quit: () => app.quit(),
  onSecondInstance: (handler) => {
    app.on('second-instance', handler);
  },
  getWindow: () => mainWindow,
  reopen: () => {
    if (lastOpenedUrl) openBrowser(lastOpenedUrl);
  },
});

app.whenReady().then(async () => {
  if (!isPrimaryInstance) return; // ikkinchi nusxa — quit() allaqachon chaqirilgan

  app.dock?.hide(); // macOS: dock'da ko'rsatmaydi — faqat tray

  if (isDevWrapMode()) {
    openDevWindow();
    return;
  }

  const config = readConfig();

  if (config.role === 'server') {
    // Birinchi ishga tushish — portable Postgres initdb + conf fayllar.
    // Postgres/Valkey/api.exe spawn yoki migration muvaffaqiyatsiz bo'lsa
    // (binary topilmadi, timeout) — `Error` throw qilinadi (CLI-346);
    // foydalanuvchi jim qolgan ilova bilan chalkashmasin deb modal dialog
    // ko'rsatib chiqamiz (CLI-346 qarori: "Task 7 bilan birga").
    //
    // ⚠️ Ketma-ketlik muhim (2026-07-02 tuzatildi): migratsiyalar API'dan
    // OLDIN ishlashi shart — API boot'ida `seedPermissions`/`seedDiagnoses`
    // jadval borligini talab qiladi; avval API'ni ishga tushirib keyin
    // migratsiya qilish bo'sh (yangi) bazada API'ni darhol qulatgan bo'lardi.
    try {
      const firstRun = isFirstRun();
      if (firstRun) {
        runFirstSetup();
        await startDatabaseLayer();
        runMigrations(API_EXE);
        await startApiLayer(config.serverPort);
      } else {
        await startServer(config.serverPort);
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
        // `/settings` index route SPA'da YO'Q (App.tsx catch-all uni `/`ga
        // qaytaradi — tray "Sozlamalar" hech narsa ochmayotganday ko'rinardi,
        // 2026-07-06 Linux E2E'da topildi). Desktop-ulanish kartasi
        // (DesktopServerConnectionCard) joylashgan mavjud sahifaga ochamiz.
        onSettings: () => openBrowser(`${localUrl}/settings/integrations`),
        onStop: async () => {
          stopServerDiscovery();
          await stopServer();
          app.quit();
        },
      },
    );
    // Litsenziya faollashtirilmagan bo'lsa (`.lic` fayl yo'q) — asosiy UI
    // o'rniga aktivatsiya sahifasi ochiladi (CLI-348 qaror 1). Web app
    // `/activate` sahifasi qurilgan va ro'yxatdan o'tgan
    // (`apps/web/src/features/auth/pages/activate.page.tsx`, commit 7670124)
    // — bu yerda faqat desktop-tomon signal+redirect ulanadi.
    openBrowser(hasLicense() ? localUrl : `${localUrl}/activate`);
  } else {
    // Klient rejimi — LAN discovery orqali server qidiriladi.
    const serverUrl = config.serverUrl || (await findServer());

    const connectedCallbacks = (url: string) => ({
      onOpen: () => openBrowser(url),
      // Server-mode tray bilan bir xil sabab — `/settings` index route yo'q.
      onSettings: () => openBrowser(`${url}/settings/integrations`),
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
  // Dev rejimida tray yo'q — oyna yopilsa ilova ham chiqadi (standart Electron
  // xatti-harakati). Paketlangan build — tray app, oyna yopilganda chiqmaydi
  // (server/klient tray'da ishlayveradi).
  if (isDevWrapMode()) app.quit();
});

app.on('before-quit', async () => {
  if (!isPrimaryInstance) return; // ikkinchi nusxa hech narsa ishga tushirmagan
  if (isDevWrapMode()) return; // dev rejimida process-manager/discovery ishga tushmagan

  const config = readConfig();
  if (config.role === 'server') {
    stopServerDiscovery();
    await stopServer();
  } else {
    stopClientReconnectLoop?.();
    stopClientReconnectLoop = null;
  }
});
