/**
 * UI-3 / D.1 — zaxira uchun uploads arxivi (`tar`) va texnik-ish serveri.
 *
 * Windows 10 1803+ da `tar.exe` (bsdtar) tizimda bor; Linux dev'da `tar`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname } from 'node:path';

const runTar = (args: string[], label: string): void => {
  const r = spawnSync('tar', args, { stdio: 'pipe' });
  if (r.error) throw new Error(`${label} failed: ${r.error.message}`);
  if (r.status !== 0)
    throw new Error(`${label} failed: ${r.stderr?.toString() || 'unknown error'}`);
};

export const createUploadsTools = (getUploadsDir: () => string) => ({
  /** uploads papkasini `dest` (.tar) ga arxivlaydi; papka yo'q bo'lsa `false`. */
  archiveUploads: (dest: string): boolean => {
    const dir = getUploadsDir();
    if (!existsSync(dir)) return false;
    runTar(['-cf', dest, '-C', dir, '.'], 'tar create');
    return true;
  },
  /**
   * Arxivni vaqtinchalik papkaga ochadi va keyin uploads bilan almashtiradi: ochish yiqilsa joriy
   * uploads tegilmaydi; almashtirish paytida eskisi `.old` ga olinadi va muvaffaqiyatdan keyin o'chadi.
   */
  extractUploads: (src: string): void => {
    const dir = getUploadsDir();
    const parent = dirname(dir);
    const incoming = `${dir}.restore-tmp`;
    const old = `${dir}.old`;
    rmSync(incoming, { recursive: true, force: true });
    rmSync(old, { recursive: true, force: true });
    mkdirSync(incoming, { recursive: true });
    try {
      runTar(['-xf', src, '-C', incoming], 'tar extract');
    } catch (err) {
      rmSync(incoming, { recursive: true, force: true });
      throw err;
    }
    mkdirSync(parent, { recursive: true });
    if (existsSync(dir)) renameSync(dir, old);
    try {
      renameSync(incoming, dir);
    } catch (err) {
      if (existsSync(old)) renameSync(old, dir); // orqaga
      throw err;
    }
    rmSync(old, { recursive: true, force: true });
  },
});

const MAINTENANCE_HTML = `<!doctype html><html lang="uz"><head><meta charset="utf-8"><title>Texnik ish</title><meta http-equiv="refresh" content="15"><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f7f9;color:#1b2430}main{text-align:center;max-width:420px;padding:24px}</style></head><body><main><h1>Texnik ish</h1><p>Ma'lumotlar zaxiradan tiklanmoqda. Bir necha daqiqadan keyin qayta urinib ko'ring.</p></main></body></html>`;

/** Tiklash paytida API portida «Texnik ish» (503) ko'rsatadi: klientlar ulanish xatosi emas, tushunarli xabar ko'radi. */
export const createMaintenanceServer = (getPort: () => number) => {
  let server: Server | null = null;
  return {
    start: async (): Promise<void> => {
      const port = getPort();
      server = createServer((req, res) => {
        const isApi = (req.url ?? '').startsWith('/api/');
        res.statusCode = 503;
        res.setHeader('Retry-After', '15');
        if (isApi) {
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              success: false,
              error: { code: 'maintenance', message: 'Texnik ish: ma’lumotlar tiklanmoqda' },
            }),
          );
        } else {
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.end(MAINTENANCE_HTML);
        }
      });
      const srv = server;
      // API porti endigina bo'shagan bo'lishi mumkin — qisqa qayta urinishlar.
      for (let attempt = 0; ; attempt++) {
        try {
          await new Promise<void>((resolve, reject) => {
            srv.once('error', reject);
            srv.listen(port, () => {
              srv.off('error', reject);
              resolve();
            });
          });
          return;
        } catch (err) {
          if (attempt >= 10 || (err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err;
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    },
    stop: async (): Promise<void> => {
      const srv = server;
      server = null;
      if (!srv) return;
      srv.closeAllConnections();
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    },
  };
};
