/**
 * CLI-379/400 — integrations tester (Telegram getMe / Eskiz auth-login) — pure
 * service-level test with INJECTED checkers. Never hits real Telegram/Eskiz
 * over the network; the default `fetch`-backed checkers (`defaultCheckTelegram`,
 * `defaultCheckEskiz`) are exercised only via the real route in production.
 *
 * Run: `cd apps/api && bun test tests/integration/cli-379-integrations-test.test.ts --env-file=../../.env`
 * (module transitively imports `env.ts`, which validates at import time — no DB
 * or MESSAGING_SECRET needed for this test itself, just a valid env file).
 */

import { describe, expect, test } from 'bun:test';
import { createIntegrationsTester } from '../../src/modules/tenant-settings/integrations-tester.ts';

describe('createIntegrationsTester', () => {
  test('telegram valid token → ok', async () => {
    const tester = createIntegrationsTester({
      checkTelegram: async () => ({ ok: true, username: 'clinicbot' }),
      checkEskiz: async () => ({ ok: true }),
    });
    const res = await tester.test({ target: 'telegram', telegram: { botToken: 'x'.repeat(40) } });
    expect(res.ok).toBe(true);
    expect(res.detail).toContain('clinicbot');
  });

  test('eskiz bad creds → not ok', async () => {
    const tester = createIntegrationsTester({
      checkTelegram: async () => ({ ok: true }),
      checkEskiz: async () => ({ ok: false }),
    });
    const res = await tester.test({
      target: 'sms',
      sms: { eskizEmail: 'a@b.uz', eskizPassword: 'x' },
    });
    expect(res.ok).toBe(false);
  });

  test('invalid target (missing payload) → not ok, detail explains', async () => {
    const tester = createIntegrationsTester({
      checkTelegram: async () => ({ ok: true }),
      checkEskiz: async () => ({ ok: true }),
    });
    const res = await tester.test({ target: 'telegram' });
    expect(res.ok).toBe(false);
    expect(res.detail).toBe('invalid target');
  });
});
