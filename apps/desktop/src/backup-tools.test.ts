/** UI-3 / D.1 — texnik-ish serveri (real http) va uploads almashtirish (real tar). */
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMaintenanceServer, createUploadsTools } from './backup-tools.js';

describe('createMaintenanceServer', () => {
  test('API yo‘li 503 JSON, boshqasi 503 HTML; stop() portni bo‘shatadi', async () => {
    const port = 18000 + Math.floor(Math.random() * 1000);
    const srv = createMaintenanceServer(() => port);
    await srv.start();
    const api = await fetch(`http://127.0.0.1:${port}/api/patients`);
    expect(api.status).toBe(503);
    expect(((await api.json()) as { error: { code: string } }).error.code).toBe('maintenance');
    const page = await fetch(`http://127.0.0.1:${port}/`);
    expect(page.status).toBe(503);
    expect(await page.text()).toContain('Texnik ish');
    await srv.stop();
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toBeDefined();
  });
});

describe('createUploadsTools', () => {
  test('archive -> extract: uploads asl holatga qaytadi, .old/.restore-tmp qolmaydi; uploads yo‘q -> false', () => {
    const root = mkdtempSync(join(tmpdir(), 'bk-up-'));
    try {
      const uploads = join(root, 'uploads');
      const tools = createUploadsTools(() => uploads);
      expect(tools.archiveUploads(join(root, 'x.tar'))).toBe(false);
      mkdirSync(join(uploads, 'T1'), { recursive: true });
      writeFileSync(join(uploads, 'T1', 'a.png'), 'asl');
      expect(tools.archiveUploads(join(root, 'u.tar'))).toBe(true);
      writeFileSync(join(uploads, 'T1', 'a.png'), 'buzilgan');
      tools.extractUploads(join(root, 'u.tar'));
      expect(readFileSync(join(uploads, 'T1', 'a.png'), 'utf8')).toBe('asl');
      expect(existsSync(`${uploads}.old`)).toBe(false);
      expect(existsSync(`${uploads}.restore-tmp`)).toBe(false);
      // Buzilgan arxiv: joriy uploads tegilmaydi.
      writeFileSync(join(root, 'bad.tar'), 'tar emas');
      expect(() => tools.extractUploads(join(root, 'bad.tar'))).toThrow();
      expect(readFileSync(join(uploads, 'T1', 'a.png'), 'utf8')).toBe('asl');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
