// NOTE (deviation from brief, documented in task-1-report.md): a static
// `import ... from './crypto.ts'` is hoisted by the ESM evaluator and runs
// BEFORE any top-level statement in this file — including the
// `process.env.MESSAGING_SECRET = ...` assignment below — regardless of
// their textual order (verified empirically). That means `./crypto.ts`'s
// `env.ts` import would snapshot `Bun.env` with MESSAGING_SECRET still
// unset, defeating the deterministic-key goal. A dynamic `import()` runs as
// a normal expression in source order, so the env var is set before the
// module (and its `env.ts` snapshot) loads. Assertions are unchanged from
// the brief.
process.env.MESSAGING_SECRET = 'test-only-messaging-secret-32chars-long';

import { describe, expect, test } from 'bun:test';

const { decryptSecret, encryptSecret } = await import('./crypto.ts');

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
