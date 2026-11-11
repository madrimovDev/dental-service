import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// P11: haqiqiy createApp() CSP'si (secure-headers.test.ts faqat nusxa). Desktop'da rasmlar
// Bearer bilan fetch qilinib `blob:` object URL bo'ladi — img-src `blob:`ni ruxsat etishi shart.
// `env` modul darajasida bir marta o'qiladi — to'liq to'plamda boshqa fayllar uni oldin
// yuklaydi, shuning uchun tekshiruv ALOHIDA bun jarayonida (toza env bilan) yuriladi.
test('desktop createApp() CSP img-src allows blob: and data:', async () => {
  const dist = await mkdtemp(join(tmpdir(), 'csp-dist-'));
  await Bun.write(join(dist, 'index.html'), '<html></html>');
  const script = join(dist, 'probe.ts');
  await Bun.write(
    script,
    `const { createApp } = await import(${JSON.stringify(join(import.meta.dir, '..', 'app.ts'))});
const res = await createApp().request('/');
console.log(res.headers.get('content-security-policy') ?? '');
process.exit(0);`,
  );
  const proc = Bun.spawnSync(['bun', 'run', script], {
    cwd: join(import.meta.dir, '..', '..'),
    env: { ...process.env, WEB_DIST_DIR: dist },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const csp = proc.stdout.toString();
  expect(csp).toContain("img-src 'self' data: blob:");
});
