import { describe, expect, it } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sealKekCanary } from '../src/lib/crypto';
import { KEK_MISMATCH, verifyKek } from '../src/lib/kek-check';
import { adminSql, config, createLab, db } from './helpers';

/**
 * KEK kanareykasi (real Postgres): to'g'ri formatdagi, lekin BOSHQA KEK bilan
 * boot qilish yiqilishi kerak — aks holda yangi lab DEK'lari noto'g'ri kalit
 * bilan o'ralib, operator KEK'ni tuzatgach ochib bo'lmay qolardi.
 */
const wrongKek = () => randomBytes(32);

const readCanary = async () =>
  (await adminSql`SELECT canary FROM kek_check WHERE id = 1`)[0]?.canary as string | undefined;

describe('KEK kanareykasi', () => {
  it("to'g'ri KEK o'tadi va kanareyka yoziladi; noto'g'ri KEK → KEK_MISMATCH", async () => {
    expect(['created', 'verified']).toContain(await verifyKek(db, config.kek));
    expect(await readCanary()).toBeString();
    expect(await verifyKek(db, config.kek)).toBe('verified');
    await expect(verifyKek(db, wrongKek())).rejects.toThrow(KEK_MISMATCH);
  });

  it('kanareyka labsiz ham tekshiriladi: boshqa KEK bilan yozilgan kanareyka → yiqiladi', async () => {
    await verifyKek(db, config.kek);
    const saved = (await readCanary())!;
    try {
      // Kanareykani boshqa KEK bilan almashtiramiz — lab DEK'lari to'g'ri bo'lsa ham yiqilishi shart.
      await adminSql`UPDATE kek_check SET canary = ${sealKekCanary(wrongKek())} WHERE id = 1`;
      await expect(verifyKek(db, config.kek)).rejects.toThrow(KEK_MISMATCH);
    } finally {
      await adminSql`UPDATE kek_check SET canary = ${saved} WHERE id = 1`;
    }
  });

  it("kanareykasiz eski baza: mavjud lab DEK'i bilan tekshiradi, noto'g'ri KEK kanareyka yozmaydi", async () => {
    await createLab();
    const saved = await readCanary();
    try {
      await adminSql`DELETE FROM kek_check`;
      await expect(verifyKek(db, wrongKek())).rejects.toThrow(KEK_MISMATCH);
      expect(await readCanary()).toBeUndefined();
      expect(await verifyKek(db, config.kek)).toBe('created');
      expect(await readCanary()).toBeString();
    } finally {
      if (saved) await adminSql`UPDATE kek_check SET canary = ${saved} WHERE id = 1`;
    }
  });

  it('haqiqiy jarayon: noto‘g‘ri (lekin to‘g‘ri formatdagi) KEK bilan src/index.ts boot qilmaydi', async () => {
    await verifyKek(db, config.kek);
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
    env.LAB_HUB_KEK = wrongKek().toString('base64');
    env.API_PORT = '0';
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
    expect(err).toContain('LAB_HUB_KEK does not match');
  });
});
