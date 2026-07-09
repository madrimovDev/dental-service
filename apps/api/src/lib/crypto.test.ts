// CLI-379/400: `getOrCreateMessagingSecret` reads `process.env.MESSAGING_SECRET_PATH`
// LIVE (plain `process.env` access) at *call* time, not `env.ts`'s import-time
// validated `MESSAGING_SECRET` snapshot — so setting it here (before any
// encrypt/decrypt call) is load-order safe, and static imports are fine (see
// `tests/integration/cli-379-tenant-settings-creds.test.ts` for the same pattern).
import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decryptSecret, encryptSecret } from './crypto.ts';

const secretPath = join(tmpdir(), `dental-crypto-test-${process.pid}-messaging-secret.txt`);
process.env.MESSAGING_SECRET_PATH = secretPath;

afterAll(() => {
  if (existsSync(secretPath)) rmSync(secretPath);
});

describe('crypto (AES-256-GCM)', () => {
  test('round-trips a secret', () => {
    const enc = encryptSecret('123456:ABCdefGHI');
    expect(enc).not.toContain('123456'); // ciphertext, not plaintext
    expect(decryptSecret(enc)).toBe('123456:ABCdefGHI');
  });
  test('two encryptions of same plaintext differ (random IV)', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });
  test('tampered ciphertext fails to decrypt', () => {
    const enc = encryptSecret('secret');
    const parts = enc.split(':');
    parts[2] = Buffer.from('tampered').toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });
});
