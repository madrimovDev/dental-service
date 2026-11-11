import { describe, expect, it } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config';

const base = { ...process.env };

describe("KEK'siz boot yiqiladi", () => {
  it('loadConfig: KEK yo‘q / qisqa / noto‘g‘ri → throw', () => {
    expect(() => loadConfig({ ...base, LAB_HUB_KEK: undefined })).toThrow(/LAB_HUB_KEK/);
    expect(() => loadConfig({ ...base, LAB_HUB_KEK: Buffer.alloc(16).toString('base64') })).toThrow(
      /32/,
    );
    expect(() => loadConfig({ ...base, SUPERVISOR_HUB_TOKEN: 'short' })).toThrow(/32/);
    expect(() => loadConfig(base)).not.toThrow();
  });

  it('haqiqiy jarayon: src/index.ts KEK’siz ishga tushmaydi (exit != 0)', async () => {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(base))
      if (v !== undefined && k !== 'LAB_HUB_KEK') env[k] = v;
    env.API_PORT = '0';
    // cwd = tmpdir: Bun cwd'dagi `.env`ni avtomatik yuklaydi — lane .env KEK'ni qaytarib qo'ymasin.
    const proc = Bun.spawn(['bun', 'run', join(import.meta.dir, '..', 'src', 'index.ts')], {
      env,
      cwd: tmpdir(),
      timeout: 15_000,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const code = await proc.exited;
    const err = await new Response(proc.stderr).text();
    expect(code).not.toBe(0);
    expect(err).toContain('LAB_HUB_KEK');
  });
});
