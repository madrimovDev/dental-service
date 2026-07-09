/**
 * CLI-404 — "Server topilmadi" holatida serverUrl'ni QO'LDA kiritish uchun
 * kichik native prompt oynasi. Chicken-egg muammosini uzadi: klient rejimida
 * server topilmasa web `/settings` sahifasi ham serve qilinmaydi (uni aynan
 * o'sha yo'q server beradi), shuning uchun `openBrowser('')` no-op edi
 * (main.ts:385 `onSettings: () => {}`). Bu modul o'rniga o'zini-o'zi ta'minlovchi
 * mahalliy HTML formani kichik BrowserWindow'da ko'rsatadi.
 *
 * Natija `page-title-updated` orqali uzatiladi (preload/IPC kerak emas —
 * `nodeIntegration:false` + `contextIsolation:true` bilan xavfsiz): forma submit
 * `document.title`ni `submit:<url>`ga, bekor `cancel`ga o'zgartiradi. main process
 * title'ni `parsePromptTitle` bilan o'qiydi. Kiritilgan URL keyin CLI-434
 * `applyServerUrl` (settings-ipc.ts) orqali validatsiya + writeConfig + reconnect
 * qilinadi — bu yerda validatsiya takrorlanmaydi (yagona manba).
 */

const SUBMIT_PREFIX = 'submit:';

/** Prompt oynasi title-signalini o'qiydi (sof, testlanadi). */
export const parsePromptTitle = (
  title: string,
): { action: 'submit'; url: string } | { action: 'cancel' } | null => {
  if (title === 'cancel') return { action: 'cancel' };
  if (title.startsWith(SUBMIT_PREFIX)) {
    return { action: 'submit', url: title.slice(SUBMIT_PREFIX.length) };
  }
  return null;
};

/** Prompt oynasi HTML'i (sof, testlanadi — tashqi resurssiz, o'zini ta'minlaydi). */
export const buildServerUrlPromptHtml = (): string => `<!doctype html>
<html lang="uz">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" />
<title>Server manzili</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background: #f4f6f8; color: #1a1a1a; }
  h1 { font-size: 15px; margin: 0 0 4px; }
  p { font-size: 12px; color: #555; margin: 0 0 14px; }
  input { width: 100%; box-sizing: border-box; padding: 9px 10px; font-size: 14px; border: 1px solid #c4ccd4; border-radius: 6px; }
  .row { display: flex; gap: 8px; justify-content: flex-end; margin-top: 14px; }
  button { padding: 8px 16px; font-size: 13px; border-radius: 6px; border: 1px solid #c4ccd4; background: #fff; cursor: pointer; }
  button.primary { background: #0f766e; color: #fff; border-color: #0f766e; }
</style>
</head>
<body>
  <h1>Server manzilini kiriting</h1>
  <p>Masalan: http://192.168.1.5:8000</p>
  <form id="f">
    <input id="url" type="text" placeholder="http://192.168.1.5:8000" autofocus autocomplete="off" />
    <div class="row">
      <button type="button" id="cancel">Bekor qilish</button>
      <button type="submit" class="primary">Ulanish</button>
    </div>
  </form>
  <script>
    var input = document.getElementById('url');
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (v) document.title = '${SUBMIT_PREFIX}' + v;
    });
    document.getElementById('cancel').addEventListener('click', function () {
      document.title = 'cancel';
    });
  </script>
</body>
</html>`;

/** Minimal BrowserWindow yuzasi — Electron'siz testlash uchun DI. */
export interface PromptWindowLike {
  loadURL(url: string): Promise<void> | void;
  webContents: { on(event: 'page-title-updated', cb: (e: unknown, title: string) => void): void };
  on(event: 'closed', cb: () => void): void;
  close(): void;
  isDestroyed(): boolean;
}

/**
 * serverUrl prompt oynasini ko'rsatadi va foydalanuvchi kiritgan xom qatorni
 * (yoki bekor qilsa `null`) qaytaradi. `createWindow` inject qilinadi (main.ts
 * real BrowserWindow beradi; test soxta oyna beradi). Validatsiya QILINMAYDI —
 * chaqiruvchi `applyServerUrl`ga uzatadi (CLI-434 yagona validatsiya manbasi).
 */
export const promptServerUrl = (createWindow: () => PromptWindowLike): Promise<string | null> =>
  new Promise((resolve) => {
    const win = createWindow();
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
      if (!win.isDestroyed()) win.close();
    };
    win.webContents.on('page-title-updated', (_e, title) => {
      const parsed = parsePromptTitle(title);
      if (!parsed) return;
      finish(parsed.action === 'submit' ? parsed.url : null);
    });
    win.on('closed', () => finish(null));
    void win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(buildServerUrlPromptHtml())}`,
    );
  });
