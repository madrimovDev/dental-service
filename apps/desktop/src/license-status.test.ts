import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasLicense } from './license-status';

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
});
