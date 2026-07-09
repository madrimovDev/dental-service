/**
 * CLI-379/400 — integrations tester: validates Telegram bot token / Eskiz
 * credentials from the Settings UI BEFORE they're saved (so a typo'd token
 * doesn't silently break reminders/recall SMS later).
 *
 * Deps are injectable (`IntegrationsTesterDeps`) so tests never hit the real
 * Telegram/Eskiz APIs — `createIntegrationsTester()` (no args) uses the real
 * `fetch`-backed `defaultCheckTelegram`/`defaultCheckEskiz`.
 *
 * This module never persists anything — the route that wires it in is a pure
 * "test these creds" action, distinct from `PATCH /tenant-settings` (which
 * actually encrypts+saves via `tenant-settings.service.ts`).
 */

export type IntegrationsTestInput = {
  target: 'telegram' | 'sms';
  telegram?: { botToken: string };
  sms?: { eskizEmail: string; eskizPassword: string };
};

export type IntegrationsTestResult = {
  ok: boolean;
  detail: string | null;
};

export type IntegrationsTesterDeps = {
  checkTelegram: (token: string) => Promise<{ ok: boolean; username?: string }>;
  checkEskiz: (email: string, password: string) => Promise<{ ok: boolean }>;
};

/** Real Telegram Bot API `getMe` call — `ok:true` + `username` iff the token is valid. */
export const defaultCheckTelegram = async (token: string) => {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const j = (await r.json()) as { ok: boolean; result?: { username?: string } };
    return { ok: !!j.ok, username: j.result?.username };
  } catch {
    return { ok: false };
  }
};

/**
 * Real Eskiz `auth/login` call — mirrors `packages/notifications/src/eskiz.ts`:
 * Eskiz can answer HTTP 200 with an error body for bad credentials, so `res.ok`
 * alone is not a valid success signal. Only `data.token` presence counts.
 */
export const defaultCheckEskiz = async (email: string, password: string) => {
  try {
    const r = await fetch('https://notify.eskiz.uz/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = (await r.json()) as { data?: { token?: string } };
    const token = json.data?.token ?? null;
    return { ok: !!token };
  } catch {
    return { ok: false };
  }
};

export const createIntegrationsTester = (
  deps: IntegrationsTesterDeps = {
    checkTelegram: defaultCheckTelegram,
    checkEskiz: defaultCheckEskiz,
  },
) => ({
  test: async (input: IntegrationsTestInput): Promise<IntegrationsTestResult> => {
    if (input.target === 'telegram' && input.telegram) {
      const r = await deps.checkTelegram(input.telegram.botToken);
      return { ok: r.ok, detail: r.username ? `@${r.username}` : null };
    }
    if (input.target === 'sms' && input.sms) {
      const r = await deps.checkEskiz(input.sms.eskizEmail, input.sms.eskizPassword);
      return { ok: r.ok, detail: null };
    }
    return { ok: false, detail: 'invalid target' };
  },
});
