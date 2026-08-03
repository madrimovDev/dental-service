import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasLicense, licenseGatedUrl } from './license-status.js';

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
