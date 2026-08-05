import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fetchBootstrapStatus,
  hasLicense,
  licenseGatedUrl,
  resolveStartupUrl,
} from './license-status.js';

describe('hasLicense', () => {
  let tmpDir: string;
  let licensePath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'license-status-test-'));
    licensePath = join(tmpDir, 'license.lic');
    process.env.LICENSE_PATH = licensePath;
  });

  afterEach(async () => {
    delete process.env.LICENSE_PATH;
    await rm(tmpDir, { recursive: true, force: true });
  });

  test(".lic fayl mavjud bo'lmasa false qaytaradi", () => {
    expect(hasLicense()).toBe(false);
  });

  test(".lic fayl mavjud bo'lsa true qaytaradi (mazmuni tekshirilmaydi — existence-only)", async () => {
    await writeFile(licensePath, 'not-real-encrypted-payload');
    expect(hasLicense()).toBe(true);
  });

  // CLI-361 — tray "Sozlamalar"/"Ochish" litsenziyasiz holatda `/activate`ga
  // qaytishi shart (real Windows test'da topilgan qopqon: `/settings/...`
  // auth talab qilib `/login`ga uloqtirardi).
  describe('licenseGatedUrl', () => {
    test("litsenziya yo'q — har qanday yo'l /activate'ga gate qilinadi", () => {
      expect(licenseGatedUrl('http://localhost:80')).toBe('http://localhost:80/activate');
      expect(licenseGatedUrl('http://localhost:80', '/settings/integrations')).toBe(
        'http://localhost:80/activate',
      );
    });

    test("litsenziya bor — so'ralgan yo'l ochiladi", async () => {
      await writeFile(licensePath, 'not-real-encrypted-payload');
      expect(licenseGatedUrl('http://localhost:80')).toBe('http://localhost:80');
      expect(licenseGatedUrl('http://localhost:80', '/settings/integrations')).toBe(
        'http://localhost:80/settings/integrations',
      );
    });
  });
});

describe('fetchBootstrapStatus', () => {
  test("javobni o'qiydi", async () => {
    const fakeFetch = async () =>
      new Response(JSON.stringify({ data: { hasLicense: true, hasTenant: false } }));

    const status = await fetchBootstrapStatus('http://localhost:3000', fakeFetch as never);
    expect(status).toEqual({ hasTenant: false });
  });

  test("to'g'ri manzilga so'rov yuboradi", async () => {
    const calledUrls: string[] = [];
    const fakeFetch = async (input: unknown) => {
      calledUrls.push(String(input));
      return new Response(JSON.stringify({ data: { hasLicense: true, hasTenant: true } }));
    };

    await fetchBootstrapStatus('http://localhost:3000', fakeFetch as never);
    expect(calledUrls).toEqual(['http://localhost:3000/api/bootstrap-status']);
  });

  // API port'i ochiq bo'lib, lekin boot'ni (seedPermissions/seedDiagnoses)
  // tugatmagan holatda so'rov MUDDATSIZ osilib qolishi mumkin edi — server
  // rejimida bu `app.whenReady()`ni bloklab, oynani UMUMAN ochmasdi (faqat
  // tray qolardi). Shu sabab abort signali majburiy.
  test("so'rovga timeout (abort) signali beriladi", async () => {
    let init: RequestInit | undefined;
    const fakeFetch = async (_input: unknown, i?: RequestInit) => {
      init = i;
      return new Response(JSON.stringify({ data: { hasLicense: true, hasTenant: true } }));
    };

    await fetchBootstrapStatus('http://localhost:3000', fakeFetch as never);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  test('tarmoq xatosida null qaytaradi (bloklamaydi)', async () => {
    const fakeFetch = async () => {
      throw new Error('ECONNREFUSED');
    };

    const status = await fetchBootstrapStatus('http://localhost:3000', fakeFetch as never);
    expect(status).toBeNull();
  });

  test("noto'g'ri javob shaklida null qaytaradi", async () => {
    const fakeFetch = async () => new Response('not json');
    const status = await fetchBootstrapStatus('http://localhost:3000', fakeFetch as never);
    expect(status).toBeNull();
  });

  test("javobda hasTenant yo'q bo'lsa null qaytaradi", async () => {
    const fakeFetch = async () => new Response(JSON.stringify({ data: { hasLicense: true } }));
    const status = await fetchBootstrapStatus('http://localhost:3000', fakeFetch as never);
    expect(status).toBeNull();
  });
});

describe('resolveStartupUrl', () => {
  let tmpDir: string;
  let licensePath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'startup-url-test-'));
    licensePath = join(tmpDir, 'license.lic');
    process.env.LICENSE_PATH = licensePath;
  });

  afterEach(async () => {
    delete process.env.LICENSE_PATH;
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("tenant yo'q → /activate", async () => {
    await writeFile(licensePath, 'not-real-encrypted-payload');
    expect(resolveStartupUrl('http://localhost:3000', { hasTenant: false })).toBe(
      'http://localhost:3000/activate',
    );
  });

  test('tenant bor → asosiy UI', async () => {
    await writeFile(licensePath, 'not-real-encrypted-payload');
    expect(resolveStartupUrl('http://localhost:3000', { hasTenant: true })).toBe(
      'http://localhost:3000',
    );
  });

  // Regressiya qulfi: bootstrap gate'i MAVJUD `.lic` gate'ini yutib
  // yubormasligi shart. `.lic` o'chgan (lekin tenant bor) mashinada asosiy UI
  // ochilsa har bir modul route'i `LICENSE_NOT_FOUND` 403 beradi va
  // foydalanuvchi `/activate`ga qaytolmay qopqonda qoladi.
  test("tenant bor, lekin .lic yo'q → baribir /activate", () => {
    expect(resolveStartupUrl('http://localhost:3000', { hasTenant: true })).toBe(
      'http://localhost:3000/activate',
    );
  });

  test("status noma'lum (null) + .lic bor → hozirgi xulq: asosiy UI", async () => {
    await writeFile(licensePath, 'not-real-encrypted-payload');
    expect(resolveStartupUrl('http://localhost:3000', null)).toBe('http://localhost:3000');
  });

  test("status noma'lum (null) + .lic yo'q → hozirgi xulq: /activate", () => {
    expect(resolveStartupUrl('http://localhost:3000', null)).toBe('http://localhost:3000/activate');
  });
});
