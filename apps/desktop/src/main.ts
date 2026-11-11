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
 * Klient — CLI-434 (evil-twin fix): `config.serverUrl` mavjud VA yaroqli
 * (`validateServerUrl`) bo'lsa TOFU — discovery/tasdiqlash o'tkazib
 * yuboriladi. Aks holda `findServers()` (massiv, BARCHA UDP javob — birinchi
 * javobga sakramaydi) chaqiriladi va foydalanuvchiga `chooseServerUrl()`
 * orqali tasdiqlash/tanlash so'raladi; tasdiqlangach `serverUrl` `writeConfig`
 * bilan yoziladi (keyingi startup TOFU orqali qayta so'ramaydi). Hech narsa
 * topilmasa/tasdiqlanmasa — tray "Server topilmadi" holatini ko'rsatadi va
 * `client-reconnect.ts` orqali har 30s fon da qayta discovery urinadi
 * (CLI-348 qaror 4) — bu urinishlar ham bir xil tasdiqlash oqimidan o'tadi.
 * Foydalanuvchi `/settings` sahifasida (`preload.ts` → `settings-ipc.ts`,
 * CLI-348 qaror 5) qo'lda serverUrl kiritib muvaffaqiyatli ulansa — tray/
 * brauzer yangi manzilga o'tadi (`updateTray`, YANGI `createTray` emas —
 * bitta tray ikonkasi).
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
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import electronUpdater from 'electron-updater';
import { setupAutoUpdater, type UpdateState } from './auto-updater.js';
import { createBackupScheduler, resolveDefaultBackupFolder } from './backup-scheduler.js';
import { createMaintenanceServer, createUploadsTools } from './backup-tools.js';
import { startClientReconnectLoop } from './client-reconnect.js';
import { readConfig, writeConfig } from './config.js';
import {
  type DiscoveredServer,
  findServers,
  startServerDiscovery,
  stopServerDiscovery,
} from './discovery.js';
import { isFirstRun, runFirstSetup, runMigrations } from './first-run.js';
import { fetchBootstrapStatus, licenseGatedUrl, resolveStartupUrl } from './license-status.js';
import { createPgTools, createStateStore, migrateOnStart } from './migrate-on-start.js';
import { getDataDir } from './paths.js';
import {
  getApiCommand,
  onServerStatusChange,
  PortInUseError,
  startApiLayer,
  startDatabaseLayer,
  stopApiLayer,
  stopServer,
} from './process-manager.js';
import { type PromptWindowLike, promptServerUrl } from './server-url-prompt.js';
import { applyServerUrl, registerSettingsIpc, validateServerUrl } from './settings-ipc.js';
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
// UI-3 / D.1 — server rolida kunlik zaxira + so'rov fayllari kuzatuvchisi.
let stopBackupScheduler: (() => void) | null = null;
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

const openDevWindow = async (): Promise<void> => {
  // Audit C1 — `.lic` bor, lekin lokal bazada tenant yo'q (baza yo'qolgan /
  // yangi kompyuter): fayl-mavjudligi gate'i asosiy UI'ni ochib yuborardi,
  // login esa 401 berib sababni tushuntirmasdi. `bootstrap-status` ikkalasini
  // ajratadi; so'rov muvaffaqiyatsiz bo'lsa (dev-server hali ko'tarilmagan)
  // `null` qaytadi va hozirgi `.lic` xulqi saqlanadi — gate bloklamaydi.
  const target = resolveStartupUrl(DEV_URL, await fetchBootstrapStatus(DEV_URL));
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

// CLI-434(c)/CLI-442#10 — `will-navigate` guard: in-page navigation (redirect,
// `location = ...`, form submit) is only allowed within the currently-loaded
// page's origin (same-origin login -> /activate flows etc.); any other
// origin is prevented and handed to the OS browser instead — this closes the
// gap `setWindowOpenHandler` (new-window only) doesn't cover. Origin is read
// from the window's ACTUAL committed URL at navigation time (not a captured
// variable), so it stays correct across repeated `loadURL` calls on a reused
// window (tray switching between server/settings/activate).
const guardNavigation = (contents: Electron.WebContents): void => {
  contents.on('will-navigate', (event, targetUrl) => {
    let currentOrigin: string | null = null;
    let targetOrigin: string | null = null;
    try {
      currentOrigin = new URL(contents.getURL()).origin;
    } catch {
      // no committed URL yet (e.g. about:blank) -> treat as untrusted, block below
    }
    try {
      targetOrigin = new URL(targetUrl).origin;
    } catch {
      // unparsable target -> block below
    }
    if (!currentOrigin || !targetOrigin || targetOrigin !== currentOrigin) {
      event.preventDefault();
      void shell.openExternal(targetUrl);
    }
  });
};

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
    webPreferences: {
      preload: PRELOAD_PATH,
      // CLI-442#10 — explicit (Electron defaults are already this, but not
      // documenting them invites an accidental regression on a future edit).
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    void shell.openExternal(u);
    return { action: 'deny' };
  });
  guardNavigation(mainWindow.webContents);
  void mainWindow.loadURL(url);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

/**
 * CLI-434(a) — TOFU (trust on first use) tasdiqlash UI. `findServers()` bir
 * nechta (yoki bitta) topilgan serverni qaytaradi — hech qanday holatda
 * BIRINCHISIGA jim ulanmaymiz (bu — evil-twin'ning aynan sababi edi).
 * Foydalanuvchi aniq tasdiqlashi (yoki bir nechtadan tanlashi) shart;
 * tasdiqlangan `serverUrl` chaqiruvchi tomonidan `writeConfig()`ga yoziladi
 * (TOFU — keyingi startup'lar shu saqlangan manzilni ishlatadi, discovery/
 * tasdiqlash qayta so'ralmaydi).
 */
const portBusyMessage = (port: number): string =>
  `Port ${port} boshqa dastur tomonidan band. Sozlamalar → Server porti orqali boshqa port tanlang.`;

const chooseServerUrl = async (servers: DiscoveredServer[]): Promise<string | null> => {
  if (servers.length === 0) return null;
  if (servers.length === 1) {
    const only = servers[0];
    if (!only) return null;
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Ulanish', 'Bekor qilish'],
      defaultId: 0,
      cancelId: 1,
      title: 'Server topildi',
      message: `Quyidagi serverga ulanishni tasdiqlaysizmi?\n\n${only.url}`,
    });
    return response === 0 ? only.url : null;
  }
  // Bir nechta javob (legit multi-server YOKI rogue) — foydalanuvchi
  // ro'yxatdan aniq birini tanlaydi, jim birinchi-javobga sakramaydi.
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: [...servers.map((s) => s.url), 'Bekor qilish'],
    cancelId: servers.length,
    title: 'Bir nechta server topildi',
    message: 'Bir nechta server topildi. Ulanish uchun birini tanlang:',
  });
  return response < servers.length ? (servers[response]?.url ?? null) : null;
};

// Linux dev-rejimda oyna identifikatsiyasi (WM_CLASS / Wayland app_id) xom
// "electron" bo'ladi — panel/dock ilovani electron binary'siga bog'lab,
// "Yangi oyna ochish" argumentsiz electron'ni (default welcome sahifa)
// ishga tushirardi. Unikal app-id beramiz — ~/.local/share/applications/
// dagi dev .desktop fayl (StartupWMClass=dental-service-dev) shu orqali
// bizning launcher'ga bog'lanadi va ikkinchi nusxani single-instance qulf
// yutadi. Paketlangan build'da (AppImage/NSIS) electron-builder buni o'zi
// hal qiladi — shuning uchun faqat !isPackaged.
if (process.platform === 'linux' && !app.isPackaged) {
  app.commandLine.appendSwitch('class', 'dental-service-dev'); // X11/XWayland WM_CLASS
  app.commandLine.appendSwitch('wayland-app-id', 'dental-service-dev'); // Wayland app_id
}

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
    await openDevWindow();
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
      }
      await startDatabaseLayer();
      // P2 — har startda migratsiya (yangilanishda ham sxema yangilanadi):
      // versiya o'zgargan bo'lsa oldin pg_dump, yiqilsa dump'dan tiklanadi
      // va API ISHGA TUSHIRILMAYDI.
      const migration = migrateOnStart({
        ...createStateStore(firstRun),
        ...createPgTools(),
        runMigrations: () => runMigrations(API_EXE),
        appVersion: app.getVersion(),
        now: () => new Date(),
      });
      if (!migration.ok) {
        const message =
          migration.reason === 'phone_conflict'
            ? "Yangilash to'xtatildi: bazada takroriy telefon raqamlari bor. Ta'minotchiga murojaat qiling."
            : migration.reason === 'backup_failed'
              ? "Yangilashdan oldin zaxira olinmadi, shuning uchun yangilash bajarilmadi. Ma'lumotlaringiz o'zgarmagan. Ta'minotchiga murojaat qiling."
              : migration.restored
                ? "Yangilash muvaffaqiyatsiz. Ma'lumotlar avvalgi holatga qaytarildi. Ta'minotchiga murojaat qiling."
                : `Yangilash muvaffaqiyatsiz. Ma'lumotlarni qaytarib bo'lmadi${migration.backupFile ? `, zaxira: ${migration.backupFile}` : ''}. Ta'minotchiga murojaat qiling.`;
        dialog.showErrorBox(
          "Dental Service — yangilash to'xtatildi",
          `${message}\n\nTafsilot: ${migration.message.slice(-800)}\nLoglarni ko'ring: ${LOGS_DIR}`,
        );
        await stopServer();
        app.quit();
        return;
      }
      await startApiLayer(config.serverPort);
    } catch (err) {
      if (err instanceof PortInUseError) {
        dialog.showErrorBox('Port band', portBusyMessage(err.port));
        app.quit();
        return;
      }
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

    const serverTrayCallbacks = {
      // `licenseGatedUrl` — qaror BOSILGAN paytda hisoblanadi, startup'dagi
      // bir martalik `hasLicense()` emas (CLI-361 real Windows test'da
      // topildi: litsenziyasiz tray'dan `Sozlamalar` bosilsa `/login`ga
      // uloqtirilib, `/activate`ga qaytish imkonsiz bo'lib qolardi).
      onOpen: () => openBrowser(licenseGatedUrl(localUrl)),
      // `/settings` index route SPA'da YO'Q (App.tsx catch-all uni `/`ga
      // qaytaradi — tray "Sozlamalar" hech narsa ochmayotganday ko'rinardi,
      // 2026-07-06 Linux E2E'da topildi). Desktop-ulanish kartasi
      // (DesktopServerConnectionCard) joylashgan mavjud sahifaga ochamiz.
      onSettings: () => openBrowser(licenseGatedUrl(localUrl, '/settings/integrations')),
      onStop: async () => {
        stopServerDiscovery();
        await stopServer();
        app.quit();
      },
    };
    createTray('server', { serverUrl: localUrl, serverState: 'ok' }, serverTrayCallbacks);
    // P15 — child process holati tray'da; urinishlar tugasa xabar beriladi.
    onServerStatusChange((e) => {
      const serverState = e.gaveUp ? 'down' : e.status === 'running' ? 'ok' : 'restarting';
      updateTray('server', { serverUrl: localUrl, serverState }, serverTrayCallbacks);
      if (e.gaveUp) {
        if (e.portBusy) {
          dialog.showErrorBox('Port band', portBusyMessage(e.portBusy));
        } else {
          new Notification({
            title: 'Dental Service',
            body: "Server komponenti qayta-qayta to'xtadi. Dasturni qayta ishga tushiring.",
          }).show();
        }
      }
    });
    // UI-3 / D.1 — zaxira nusxa: har kuni 20:00 + API topshirgan so'rovlar (`backup-request.json`,
    // `restore-request.json`). Tiklash API'ni to'xtatadi, shuning uchun u `config.serverPort`ni biladi.
    const pgTools = createPgTools();
    const uploadsTools = createUploadsTools(() => join(getDataDir(), 'uploads'));
    const backupScheduler = createBackupScheduler({
      now: () => new Date(),
      timers: {
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
        setInterval: (fn, ms) => setInterval(fn, ms),
        clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
      },
      getDataDir,
      defaultFolder: () =>
        resolveDefaultBackupFolder({
          platform: process.platform,
          dataDir: getDataDir(),
          driveExists: existsSync,
        }),
      dump: pgTools.dump,
      restoreDb: pgTools.restore,
      archiveUploads: uploadsTools.archiveUploads,
      extractUploads: uploadsTools.extractUploads,
      migrate: () => runMigrations(API_EXE),
      stopApi: stopApiLayer,
      startApi: () => startApiLayer(config.serverPort),
      maintenance: createMaintenanceServer(() => config.serverPort),
      log: (message) => {
        try {
          mkdirSync(LOGS_DIR, { recursive: true });
          appendFileSync(join(LOGS_DIR, 'backup.log'), `${new Date().toISOString()} ${message}\n`);
        } catch {
          // log yozib bo'lmasa ham zaxira oqimi to'xtamasin
        }
      },
    });
    backupScheduler.start();
    stopBackupScheduler = backupScheduler.stop;
    // Litsenziya faollashtirilmagan bo'lsa (`.lic` fayl yo'q) — asosiy UI
    // o'rniga aktivatsiya sahifasi ochiladi (CLI-348 qaror 1). Web app
    // `/activate` sahifasi qurilgan va ro'yxatdan o'tgan
    // (`apps/web/src/features/auth/pages/activate.page.tsx`, commit 7670124)
    // — bu yerda faqat desktop-tomon signal+redirect ulanadi.
    //
    // Audit C1 — `.lic` bor, lekin lokal bazada tenant yo'q (baza yo'qolgan /
    // yangi kompyuter) holatini fayl-mavjudligi gate'i ajrata olmaydi:
    // asosiy UI ochilar, login 401 berar, foydalanuvchi sababni bilmasdi.
    // `bootstrap-status` shu ikkisini ajratadi. So'rov `createTray`dan KEYIN —
    // API boot'i sekin bo'lsa ham tray darhol ko'rinadi; javob kelmasa
    // (timeout/xato) `null` qaytadi va hozirgi `.lic` xulqi saqlanadi.
    openBrowser(resolveStartupUrl(localUrl, await fetchBootstrapStatus(localUrl)));
  } else {
    // Klient rejimi — CLI-434: TOFU. `config.serverUrl` (avval foydalanuvchi
    // tomonidan tasdiqlangan) mavjud VA hali ham yaroqli host/scheme'ga ega
    // bo'lsa (eski buzuq/qo'lda tahrirlangan config bo'lishi mumkin) —
    // discovery/tasdiqlash BUTUNLAY o'tkazib yuboriladi (qayta so'ralmaydi).
    // Aks holda discovery + foydalanuvchi tasdig'i orqali topiladi — HECH
    // QACHON birinchi UDP javobiga jim ishonilmaydi (evil-twin fix).
    const trustedUrl =
      config.serverUrl && validateServerUrl(config.serverUrl).ok ? config.serverUrl : null;

    const connectedCallbacks = (url: string) => ({
      onOpen: () => openBrowser(url),
      // Server-mode tray bilan bir xil sabab — `/settings` index route yo'q.
      onSettings: () => openBrowser(`${url}/settings/integrations`),
      onStop: () => app.quit(),
    });

    // Ulanish muvaffaqiyatli bo'lganda (web `/settings` IPC YOKI CLI-404 native
    // prompt orqali) — fon reconnect'ni to'xtat, tray'ni ulangan holatga o'tkaz,
    // brauzerni och. Ikkala yo'l ham shu bitta handler'ni ishlatadi (DRY).
    const onServerConnected = (url: string) => {
      stopClientReconnectLoop?.();
      stopClientReconnectLoop = null;
      updateTray('client', { serverUrl: url }, connectedCallbacks(url));
      openBrowser(url);
    };

    // CLI-404: "Server topilmadi" holatidagi native prompt oynasi (web yo'q).
    const createPromptWindow = (): PromptWindowLike =>
      new BrowserWindow({
        width: 400,
        height: 250,
        resizable: false,
        fullscreenable: false,
        title: 'Server manzili',
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      }) as unknown as PromptWindowLike;

    // Sozlamalar'da (web `/settings`, `preload.ts` orqali) qo'lda kiritilgan
    // serverUrl — `writeConfig()` + reconnect urinishi (CLI-348 qaror 5).
    // `registerSettingsIpc` o'zi `validateServerUrl` bilan gate qiladi
    // (CLI-434(b) — settings-ipc.ts), shuning uchun bu yerda qo'shimcha
    // tekshiruv shart emas. Muvaffaqiyatli ulansa tray/brauzer yangi
    // manzilga o'tadi, joriy fon discovery retry (bo'lsa) to'xtatiladi.
    registerSettingsIpc({ ipcMain, writeConfig, onConnected: onServerConnected });

    if (trustedUrl) {
      createTray('client', { serverUrl: trustedUrl }, connectedCallbacks(trustedUrl));
      openBrowser(trustedUrl);
    } else {
      const discovered = await findServers();
      const chosen = await chooseServerUrl(discovered);

      if (chosen) {
        // TOFU — bir marta tasdiqlangach config'ga yoziladi, keyingi
        // startup'lar `trustedUrl` orqali qayta so'ramasdan ishlatadi.
        writeConfig({ serverUrl: chosen });
        createTray('client', { serverUrl: chosen }, connectedCallbacks(chosen));
        openBrowser(chosen);
      } else {
        // Server topilmadi (yoki foydalanuvchi tasdiqlashni bekor qildi) —
        // tray "Server topilmadi" holatini ko'rsatadi va har 30s fon da
        // qayta discovery urinadi (CLI-348 qaror 4). Topilgan har bir
        // urinish HAM bir xil tasdiqlash oqimidan o'tadi (CLI-434 §2a —
        // reconnect ham "birinchi ulanish", jim avto-connect qilmaydi).
        // `updateTray` chaqiriladi — YANGI `createTray` emas, aks holda
        // ikkinchi tray ikonkasi yaratilib qoladi.
        createTray(
          'client',
          { serverUrl: '', serverFound: false },
          {
            onOpen: () => {},
            // CLI-404: server yo'q → web `/settings` ham serve qilinmaydi
            // (chicken-egg). Native prompt oynasida serverUrl qo'lda kiritiladi →
            // `applyServerUrl` (CLI-434 validatsiya + writeConfig + health-check) →
            // ulansa `onServerConnected` tray/brauzerni ulangan holatga o'tkazadi.
            onSettings: async () => {
              const entered = await promptServerUrl(createPromptWindow, {
                // «Hozir qidirish» — 30 s kutmasdan darhol discovery.
                onRescan: () => {
                  void (async () => {
                    const found = await findServers();
                    const confirmed = await chooseServerUrl(found);
                    if (!confirmed) return;
                    await applyServerUrl(confirmed, {
                      writeConfig,
                      onConnected: onServerConnected,
                    });
                  })();
                },
              });
              if (!entered) return;
              const res = await applyServerUrl(entered, {
                writeConfig,
                onConnected: onServerConnected,
              });
              if (!res.ok) {
                dialog.showErrorBox(
                  "Noto'g'ri manzil",
                  'Faqat mahalliy tarmoq manzili qabul qilinadi (masalan http://192.168.1.5:8000).',
                );
              } else if (!res.connected) {
                dialog.showErrorBox(
                  "Ulanib bo'lmadi",
                  'Server javob bermadi. Manzilni va serverning ishlayotganini tekshiring.',
                );
              }
            },
            onStop: () => {
              stopClientReconnectLoop?.();
              app.quit();
            },
          },
        );
        stopClientReconnectLoop = startClientReconnectLoop({
          findServers,
          onFound: (found) => {
            stopClientReconnectLoop = null;
            void (async () => {
              const confirmed = await chooseServerUrl(found);
              if (!confirmed) return; // foydalanuvchi bekor qildi — tray "topilmadi" holicha qoladi
              writeConfig({ serverUrl: confirmed });
              updateTray('client', { serverUrl: confirmed }, connectedCallbacks(confirmed));
              openBrowser(confirmed);
            })();
          },
        });
      }
    }
  }

  // UI-T3 — yangilanish ish vaqtidan (filial yopilishi) keyin o'rnatiladi;
  // web UpdateBanner holatni IPC orqali oladi. Filial `workHours.close` hali
  // desktop main'ga yetkazilmagan — config `workCloseTime` (HH:mm) yoki 19:00.
  let lastUpdateState: UpdateState | null = null;
  const updaterControls = setupAutoUpdater({
    isPackaged: app.isPackaged,
    updater: autoUpdater,
    notify: (title, body) => new Notification({ title, body }).show(),
    setTrayToolTip,
    getWorkClose: () => (readConfig() as { workCloseTime?: string }).workCloseTime ?? null,
    onState: (state) => {
      lastUpdateState = state;
      mainWindow?.webContents.send('dental:update-state', state);
    },
  });
  ipcMain.handle('dental:update-get-state', () => lastUpdateState);
  ipcMain.handle('dental:update-install-now', () => updaterControls?.installNow());
  ipcMain.handle('dental:update-install-tonight', () => updaterControls?.installTonight());
});

app.on('window-all-closed', () => {
  // Dev rejimida tray yo'q — oyna yopilsa ilova ham chiqadi (standart Electron
  // xatti-harakati). Paketlangan build — tray app, oyna yopilganda chiqmaydi
  // (server/klient tray'da ishlayveradi).
  if (isDevWrapMode()) app.quit();
});

// P15 — server rolida chiqishdan oldin child process'lar toza to'xtatilishi
// shart (postgres `pg_ctl stop`): quit to'xtatiladi, stopServer() kutiladi,
// keyin `app.exit(0)` (before-quit'ga qayta kirmaslik uchun bayroq).
let serverStopHandled = false;
app.on('before-quit', (event) => {
  if (!isPrimaryInstance) return; // ikkinchi nusxa hech narsa ishga tushirmagan
  if (isDevWrapMode()) return; // dev rejimida process-manager/discovery ishga tushmagan

  const config = readConfig();
  if (config.role === 'server') {
    if (serverStopHandled) return;
    serverStopHandled = true;
    event.preventDefault();
    stopBackupScheduler?.();
    stopServerDiscovery();
    stopServer()
      .catch(() => {})
      .finally(() => app.exit(0));
  } else {
    stopClientReconnectLoop?.();
    stopClientReconnectLoop = null;
  }
});
