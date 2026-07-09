# Per-tenant Telegram + Eskiz Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Har tenant o'z Telegram bot token va Eskiz SMS kredensiallarini desktop/web sozlamalari orqali kiritadi (build-vaqti `env` o'rniga AES-shifrlangan DB), Telegram bemor-linking (contact-share) bilan to'liq outbound.

**Architecture:** Kredensiallar `tenant_settings.integration_settings` (mavjud jsonb) da AES-256-GCM shifrlanadi; GET javobda maskalanadi. API worker process ichida per-tenant Telegraf long-poll bot-manager ishlaydi (Redis pub/sub bilan real-time reload). recall/reminder worker'lar per-tenant kanal (Telegram chat_id > Eskiz SMS > NoOp) tanlaydi.

**Tech Stack:** Bun, Hono (`@hono/zod-openapi`), Drizzle, Zod 4, `telegraf`, `bullmq`+`ioredis` (Valkey), `node:crypto` (AES-256-GCM), React+Mantine (web).

## Global Constraints

- **Zod 4** — web forms use `zod4Resolver` (not plain `zodResolver`).
- **RLS-only** — services read tx-bound db via `getDb(c)`; workers use `withTenant(tenantId, fn)` for tenant-scoped queries, `adminDb` for cross-tenant scan.
- **OpenAPI single source** — new/changed response DTOs → `bun run generate:contract` regenerates api-client; web imports generated types. Backend routes use `OpenAPIHono`+`createRoute`+`okJson`.
- **Mapper Date rule** — `timestamp()` col → `.toISOString()`; `date()` col → passthrough string.
- **Secrets never returned raw** — GET responses mask credentials (`configured` + last-4 hint).
- **Pre-commit** = `bunx biome check --write <files>` BEFORE commit (hook only checks) + full `turbo typecheck` (18 tasks). After `generate:contract`: `bun run typecheck --force` (cache masks regen drift).
- **DB for tests** — `dental-postgres` on host port **5433** (`postgres-mnazorat` holds 5432); run migrate/tests with `--env-file=<scratchpad>/.env.5433` (5432→5433 copy). Integration tests race on TRUNCATE — run at-risk files individually.
- **Commit trailer:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure

- **Create** `apps/api/src/lib/crypto.ts` — `encryptSecret`/`decryptSecret` (AES-256-GCM) + `getOrCreateMessagingSecret`.
- **Create** `apps/api/src/lib/crypto.test.ts` — round-trip + wrong-key unit tests.
- **Modify** `packages/db-schema/src/tables/patients.ts` — add `telegramChatId` column.
- **Create** `apps/api/drizzle/0039_patients_telegram_chat_id.sql` + journal entry.
- **Modify** `apps/api/src/modules/tenant-settings/tenant-settings.schema.ts` — integration update input + DTO shape.
- **Modify** `apps/api/src/modules/tenant-settings/tenant-settings.service.ts` — encrypt on write.
- **Modify** `apps/api/src/modules/tenant-settings/tenant-settings.mapper.ts` — mask on read.
- **Create** `apps/api/src/modules/tenant-settings/integrations-test.routes.ts` (or fold into existing routes) — `POST /tenant-settings/integrations/test`.
- **Create** `apps/api/src/lib/telegram-bot-manager.ts` — per-tenant Telegraf launch/stop/reload + contact-link handler.
- **Create** `apps/api/src/lib/telegram-bot-manager.test.ts` — contact→link + reload unit tests.
- **Modify** `apps/api/src/worker.ts` — boot `startTelegramBotManager`.
- **Modify** `apps/api/src/lib/recall-worker.ts` + `reminder-worker.ts` — per-tenant channel resolution.
- **Create** `apps/api/src/lib/tenant-channel.ts` — `resolveTenantChannel(settings, chatId)` shared helper.
- **Modify** web settings feature — Integrations card (Telegram/Eskiz inputs + Tekshir).
- **Modify** `packages/i18n/src/locales/{uz,ru}.json` — integration UI strings.
- **Delete** `apps/telegram-bot/` — logic moved into bot-manager (update root `package.json` workspaces + `turbo`).
- **Modify** `apps/api/src/lib/env-schema.ts` — drop `TELEGRAM_BOT_TOKEN`/`ESKIZ_EMAIL`/`ESKIZ_PASSWORD`, add optional `MESSAGING_SECRET`.

---

### Task 1: Crypto helper (AES-256-GCM)

**Files:**
- Create: `apps/api/src/lib/crypto.ts`
- Test: `apps/api/src/lib/crypto.test.ts`

**Interfaces:**
- Produces: `encryptSecret(plain: string): string` (returns `iv:tag:ciphertext` base64, colon-joined), `decryptSecret(enc: string): string`, `getOrCreateMessagingSecret(): Buffer` (32-byte key from `MESSAGING_SECRET` env or desktop `dataDir/messaging-secret.txt`, 0600, created if absent — mirrors `first-run.ts::getOrCreateJwtSecret`).

- [ ] **Step 1: Write failing test**

```ts
// apps/api/src/lib/crypto.test.ts
import { describe, expect, test } from 'bun:test';
import { decryptSecret, encryptSecret } from './crypto.ts';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/lib/crypto.test.ts`
Expected: FAIL — `Cannot find module './crypto.ts'`.

- [ ] **Step 3: Implement crypto.ts**

```ts
// apps/api/src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from './env.ts';

// 32-byte AES-256 key. Cloud: MESSAGING_SECRET env (hex/utf8, >=32 chars).
// Desktop: persisted file in dataDir (jwt-secret.txt pattern) — machine-local.
let cachedKey: Buffer | null = null;

const getSecretPath = (): string =>
  process.env.MESSAGING_SECRET_PATH ??
  (process.platform === 'win32'
    ? 'C:\\ProgramData\\DentalService\\messaging-secret.txt'
    : `${process.env.DENTAL_DATA_DIR ?? '/var/lib/dental-service'}/messaging-secret.txt`);

export const getOrCreateMessagingSecret = (): Buffer => {
  if (cachedKey) return cachedKey;
  const fromEnv = env.MESSAGING_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    cachedKey = Buffer.from(fromEnv).subarray(0, 32);
    return cachedKey;
  }
  const path = getSecretPath();
  let hex: string;
  if (existsSync(path)) {
    hex = readFileSync(path, 'utf8').trim();
  } else {
    hex = randomBytes(32).toString('hex');
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, hex, { mode: 0o600 });
  }
  cachedKey = Buffer.from(hex, 'hex').subarray(0, 32);
  return cachedKey;
};

export const encryptSecret = (plain: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getOrCreateMessagingSecret(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
};

export const decryptSecret = (enc: string): string => {
  const [ivB64, tagB64, ctB64] = enc.split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('malformed ciphertext');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getOrCreateMessagingSecret(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};
```

Also add to `apps/api/src/lib/env-schema.ts` the field `MESSAGING_SECRET: z.string().optional()` (near JWT_SECRET). Test uses no env → falls to file path (writes a tmp secret); set `MESSAGING_SECRET_PATH` in the test to a scratch file if `/var/lib` is unwritable:
prepend to the test file: `process.env.MESSAGING_SECRET = 'test-only-messaging-secret-32chars-long';` (deterministic key, avoids fs).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test src/lib/crypto.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
bunx biome check --write apps/api/src/lib/crypto.ts apps/api/src/lib/crypto.test.ts apps/api/src/lib/env-schema.ts
git add apps/api/src/lib/crypto.ts apps/api/src/lib/crypto.test.ts apps/api/src/lib/env-schema.ts
git commit -m "feat(api): AES-256-GCM secret crypto for messaging credentials (CLI-379/400)"
```

---

### Task 2: patients.telegram_chat_id column

**Files:**
- Modify: `packages/db-schema/src/tables/patients.ts`
- Create: `apps/api/drizzle/0039_patients_telegram_chat_id.sql` + `meta/_journal.json` entry

**Interfaces:**
- Produces: `patients.telegramChatId` (`text`, nullable) — bot-manager writes it, workers read it.

- [ ] **Step 1: Add column to schema**

In `packages/db-schema/src/tables/patients.ts`, after the `photoUrl`/`notes` block (near `allowEmergencyRecall` added in CLI-474 L8):

```ts
    // CLI-379: Telegram bemor-linking (contact-share) natijasi — bot chat_id.
    telegramChatId: text('telegram_chat_id'),
```

- [ ] **Step 2: Generate migration**

Run: `bun --filter @dental/api db:generate`
Expected: creates `apps/api/drizzle/0039_*.sql` with `ALTER TABLE "patients" ADD COLUMN "telegram_chat_id" text;`. Read it — confirm ONLY that column change (no drift).

- [ ] **Step 3: Apply + verify (5433)**

Run: `cd apps/api && bun --env-file=<scratchpad>/.env.5433 run src/db/migrate.ts 2>&1 | grep -E "completed|done"`
Expected: "All migrations done".

- [ ] **Step 4: Typecheck**

Run: `bun --filter @dental/db-schema typecheck && bun --filter @dental/api typecheck`
Expected: EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add packages/db-schema/src/tables/patients.ts apps/api/drizzle/
git commit -m "feat(db): patients.telegram_chat_id for Telegram linking (CLI-379)"
```

---

### Task 3: tenant-settings integration credentials (encrypt on write, mask on read)

**Files:**
- Modify: `apps/api/src/modules/tenant-settings/tenant-settings.schema.ts`
- Modify: `apps/api/src/modules/tenant-settings/tenant-settings.service.ts`
- Modify: `apps/api/src/modules/tenant-settings/tenant-settings.mapper.ts`
- Test: `apps/api/src/modules/tenant-settings/tenant-settings.mapper.test.ts` (extend)

**Interfaces:**
- Consumes: `encryptSecret`/`decryptSecret` (Task 1).
- Produces: `integration_settings` shape `{ telegram: { botTokenEnc, botUsername? } | null, sms: { eskizEmailEnc, eskizPasswordEnc } | null }`; DTO `integrationSettings: { telegram: { configured: boolean, hint: string | null }, sms: { configured: boolean, hint: string | null } }`.

- [ ] **Step 1: Write failing mapper test** (masking)

Add to `tenant-settings.mapper.test.ts`:

```ts
import { encryptSecret } from '../../lib/crypto.ts';

test('CLI-379/400: integration credentials are masked, never raw', () => {
  const row = {
    // ...spread an existing full row fixture (copy the file's base fixture)...
    integrationSettings: {
      telegram: { botTokenEnc: encryptSecret('123456:ABCDEFbcd'), botUsername: 'clinicbot' },
      sms: { eskizEmailEnc: encryptSecret('a@b.uz'), eskizPasswordEnc: encryptSecret('pw-xyz') },
    },
  };
  const dto = toTenantSettingsDto(row as never);
  expect(dto.integrationSettings.telegram.configured).toBe(true);
  expect(dto.integrationSettings.telegram.hint).toBe('••••Fbcd');
  expect(JSON.stringify(dto)).not.toContain('123456'); // no raw token anywhere
  expect(dto.integrationSettings.sms.configured).toBe(true);
});
```
(Prepend `process.env.MESSAGING_SECRET = 'test-only-messaging-secret-32chars-long';` at top of the test file if not already present.)

- [ ] **Step 2: Run test — verify fail**

Run: `cd apps/api && bun test src/modules/tenant-settings/tenant-settings.mapper.test.ts`
Expected: FAIL (`integrationSettings.telegram` undefined / mapper returns raw jsonb).

- [ ] **Step 3: Schema — update input + DTO**

In `tenant-settings.schema.ts`, in `updateSettingsSchema` (near `notificationSettings`/`integrationSettings`), REPLACE the loose `integrationSettings` passthrough with typed messaging inputs:

```ts
  // CLI-379/400: xom kredensiallar — service AES bilan shifrlab saqlaydi.
  // `null` → integration o'chiriladi.
  telegram: z.object({ botToken: z.string().min(20).max(200) }).nullable().optional(),
  sms: z
    .object({ eskizEmail: z.string().email().max(160), eskizPassword: z.string().min(1).max(200) })
    .nullable()
    .optional(),
```

Add to `tenantSettingsDtoSchema` (replace/extend the existing `integrationSettings` DTO field):

```ts
    integrationSettings: z
      .object({
        telegram: z.object({ configured: z.boolean(), hint: z.string().nullable() }),
        sms: z.object({ configured: z.boolean(), hint: z.string().nullable() }),
      })
      .openapi({ example: { telegram: { configured: false, hint: null }, sms: { configured: false, hint: null } } }),
```

- [ ] **Step 4: Service — encrypt on write**

In `tenant-settings.service.ts::update`, after the `const patch = { ...rest, updatedAt }` line, add messaging handling (import `encryptSecret` + read existing row for merge):

```ts
    // CLI-379/400: telegram/sms xom cred → AES shifrlab integration_settings'ga.
    if (input.telegram !== undefined || input.sms !== undefined) {
      const current = (before.integrationSettings ?? {}) as Record<string, unknown>;
      const next = { ...current };
      if (input.telegram !== undefined) {
        next.telegram =
          input.telegram === null
            ? null
            : { botTokenEnc: encryptSecret(input.telegram.botToken) };
      }
      if (input.sms !== undefined) {
        next.sms =
          input.sms === null
            ? null
            : {
                eskizEmailEnc: encryptSecret(input.sms.eskizEmail),
                eskizPasswordEnc: encryptSecret(input.sms.eskizPassword),
              };
      }
      patch.integrationSettings = next;
    }
    // Remove the raw messaging keys so they aren't written literally by {...rest}.
    delete (patch as Record<string, unknown>).telegram;
    delete (patch as Record<string, unknown>).sms;
```
(`before` is already fetched in `update` for audit; if not, `const before = await getOrCreate(c)` before building patch.)

- [ ] **Step 5: Mapper — mask on read**

In `tenant-settings.mapper.ts`, replace `integrationSettings: toIntegrationSettingsDto(row.integrationSettings)` with a masking helper. Add near top:

```ts
import { decryptSecret } from '../../lib/crypto.ts';

const maskEnc = (enc: string | undefined): { configured: boolean; hint: string | null } => {
  if (!enc) return { configured: false, hint: null };
  try {
    const raw = decryptSecret(enc);
    return { configured: true, hint: `••••${raw.slice(-4)}` };
  } catch {
    return { configured: true, hint: null };
  }
};

const toIntegrationDto = (settings: Record<string, unknown> | null) => {
  const tg = (settings?.telegram ?? null) as { botTokenEnc?: string } | null;
  const sms = (settings?.sms ?? null) as { eskizPasswordEnc?: string } | null;
  return {
    telegram: maskEnc(tg?.botTokenEnc),
    sms: maskEnc(sms?.eskizPasswordEnc),
  };
};
```
Set DTO field: `integrationSettings: toIntegrationDto(row.integrationSettings as Record<string, unknown> | null),`. Remove/adjust the old `toIntegrationSettingsDto` usage. Update other mapper-test fixtures to include `integrationSettings: null` where they previously omitted it (existing fixtures) — `maskEnc(undefined)` → `{configured:false, hint:null}`.

- [ ] **Step 6: Run mapper test — verify pass**

Run: `cd apps/api && bun test src/modules/tenant-settings/tenant-settings.mapper.test.ts`
Expected: PASS.

- [ ] **Step 7: Regenerate contract + typecheck --force**

Run: `bun run generate:contract && bun run typecheck --force`
Expected: EXIT 0 (web `tenant-settings` DTO consumers still compile — the integration DTO changed shape; fix any web reads of old `integrationSettings` if flagged).

- [ ] **Step 8: Commit**

```bash
bunx biome check --write apps/api/src/modules/tenant-settings packages/api-client
git add apps/api/src/modules/tenant-settings packages/api-client
git commit -m "feat(api): per-tenant messaging credentials — encrypt on write, mask on read (CLI-379/400)"
```

---

### Task 4: integrations test route (getMe / Eskiz login)

**Files:**
- Modify: `apps/api/src/modules/tenant-settings/tenant-settings.routes.ts` (add route) + `.schema.ts` (test body/response)
- Test: `apps/api/tests/integration/cli-379-integrations-test.test.ts`

**Interfaces:**
- Consumes: `createTelegramChannel`/`createEskizChannel` validation, or direct fetch to `getMe`/`auth/login`.
- Produces: `POST /tenant-settings/integrations/test` body `{ target: 'telegram' | 'sms', telegram?: { botToken }, sms?: { eskizEmail, eskizPassword } }` → `{ ok: boolean, detail: string | null }` (200). `tenant_settings.edit` guard.

- [ ] **Step 1: Write failing test** (route smoke with injected checker)

Design the route to take an injectable checker dep so the test doesn't hit real Telegram/Eskiz:

```ts
// cli-379-integrations-test.test.ts — service-level, injected checker
import { describe, expect, test } from 'bun:test';
import { createIntegrationsTester } from '../../src/modules/tenant-settings/integrations-tester.ts';

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
  const res = await tester.test({ target: 'sms', sms: { eskizEmail: 'a@b.uz', eskizPassword: 'x' } });
  expect(res.ok).toBe(false);
});
```

- [ ] **Step 2: Run — verify fail**

Run: `cd apps/api && bun test tests/integration/cli-379-integrations-test.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement tester + defaults**

```ts
// apps/api/src/modules/tenant-settings/integrations-tester.ts
export type IntegrationsTesterDeps = {
  checkTelegram: (token: string) => Promise<{ ok: boolean; username?: string }>;
  checkEskiz: (email: string, password: string) => Promise<{ ok: boolean }>;
};

export const defaultCheckTelegram = async (token: string) => {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const j = (await r.json()) as { ok: boolean; result?: { username?: string } };
    return { ok: !!j.ok, username: j.result?.username };
  } catch {
    return { ok: false };
  }
};
export const defaultCheckEskiz = async (email: string, password: string) => {
  try {
    const r = await fetch('https://notify.eskiz.uz/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return { ok: r.ok };
  } catch {
    return { ok: false };
  }
};

export const createIntegrationsTester = (
  deps: IntegrationsTesterDeps = { checkTelegram: defaultCheckTelegram, checkEskiz: defaultCheckEskiz },
) => ({
  test: async (input: {
    target: 'telegram' | 'sms';
    telegram?: { botToken: string };
    sms?: { eskizEmail: string; eskizPassword: string };
  }): Promise<{ ok: boolean; detail: string | null }> => {
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
```

- [ ] **Step 4: Run test — verify pass**

Run: `cd apps/api && bun test tests/integration/cli-379-integrations-test.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire route** (`tenant-settings.routes.ts`)

Add `integrationsTestSchema` (body) + `integrationsTestResultSchema` (`{ ok, detail }`) to `.schema.ts`, then a `createRoute` `POST /integrations/test` with `requirePermission('tenant_settings.edit')`, handler calls `createIntegrationsTester().test(body)` and returns `ok(result)`. Follow the existing route pattern in the same file.

- [ ] **Step 6: Regenerate + typecheck + commit**

```bash
bun run generate:contract && bun run typecheck --force
bunx biome check --write apps/api/src/modules/tenant-settings packages/api-client apps/api/tests/integration/cli-379-integrations-test.test.ts
git add apps/api/src/modules/tenant-settings packages/api-client apps/api/tests/integration/cli-379-integrations-test.test.ts
git commit -m "feat(api): POST /tenant-settings/integrations/test (getMe/eskiz login) (CLI-379/400)"
```

---

### Task 5: Telegram bot-manager (per-tenant launch + contact-link + reload)

**Files:**
- Create: `apps/api/src/lib/telegram-bot-manager.ts`
- Test: `apps/api/src/lib/telegram-bot-manager.test.ts`

**Interfaces:**
- Consumes: `decryptSecret` (Task 1), `patients.telegramChatId` (Task 2), `withTenant`.
- Produces: `startTelegramBotManager(deps)` returns `{ reload: (tenantId: string) => Promise<void>, stopAll: () => Promise<void> }`. Internal `linkContact(tx, phone, chatId): Promise<'linked' | 'not_found'>` — pure, unit-tested.

- [ ] **Step 1: Write failing test** for the pure `linkContact` logic (injected tx):

```ts
// telegram-bot-manager.test.ts
import { describe, expect, test } from 'bun:test';
import { normalizePhone } from './telegram-bot-manager.ts';

describe('normalizePhone', () => {
  test('strips spaces/dashes, keeps +digits', () => {
    expect(normalizePhone('+998 90 123-45-67')).toBe('+998901234567');
    expect(normalizePhone('998901234567')).toBe('+998901234567');
  });
});
```
(The DB-touching `linkContact` is covered by the Task 7 integration test through the worker path; here we unit-test only the pure phone normalizer to keep this task fast and Electron/Telegraf-free.)

- [ ] **Step 2: Run — verify fail**

Run: `cd apps/api && bun test src/lib/telegram-bot-manager.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement bot-manager**

```ts
// apps/api/src/lib/telegram-bot-manager.ts
import { patients } from '@dental/db-schema';
import { eq } from 'drizzle-orm';
import IORedis from 'ioredis';
import { Telegraf } from 'telegraf';
import type { Database, DbOrTx } from '../db/client.ts';
import { decryptSecret } from './crypto.ts';
import { env } from './env.ts';
import { logger } from './logger.ts';

export const normalizePhone = (raw: string): string => {
  const digits = raw.replace(/[^\d]/g, '');
  return `+${digits}`;
};

type ManagerDeps = {
  adminDb: Database;
  withTenant: <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>) => Promise<T>;
};

/** Bir tenantning telegram token'ini o'qib bot ishga tushiradi (null → yo'q). */
async function readToken(adminDb: Database, tenantId: string): Promise<string | null> {
  const { tenantSettings } = await import('@dental/db-schema');
  const [row] = await adminDb
    .select({ s: tenantSettings.integrationSettings })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);
  const enc = (row?.s as { telegram?: { botTokenEnc?: string } } | null)?.telegram?.botTokenEnc;
  return enc ? decryptSecret(enc) : null;
}

export function startTelegramBotManager(deps: ManagerDeps) {
  const bots = new Map<string, Telegraf>();

  const launch = async (tenantId: string, token: string) => {
    const bot = new Telegraf(token);
    bot.start((ctx) =>
      ctx.reply('Telefon raqamingizni ulashing:', {
        reply_markup: {
          keyboard: [[{ text: "📱 Telefonni ulashish", request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }),
    );
    bot.on('contact', async (ctx) => {
      const phone = normalizePhone(ctx.message.contact.phone_number);
      const chatId = String(ctx.chat.id);
      const outcome = await deps.withTenant(tenantId, async (tx) => {
        const [p] = await tx.select({ id: patients.id }).from(patients).where(eq(patients.phone, phone)).limit(1);
        if (!p) return 'not_found';
        await tx.update(patients).set({ telegramChatId: chatId }).where(eq(patients.id, p.id));
        return 'linked';
      });
      await ctx.reply(
        outcome === 'linked'
          ? '✅ Bog'landingiz — endi eslatmalar shu yerga keladi.'
          : '⚠️ Raqamingiz topilmadi. Klinikaga murojaat qiling.',
      );
    });
    await bot.launch(); // long-poll (non-blocking promise resolves when started)
    bots.set(tenantId, bot);
    logger.info({ tenantId }, 'Telegram bot launched');
  };

  const stop = async (tenantId: string) => {
    const bot = bots.get(tenantId);
    if (bot) {
      bot.stop('reload');
      bots.delete(tenantId);
    }
  };

  const reload = async (tenantId: string) => {
    await stop(tenantId);
    const token = await readToken(deps.adminDb, tenantId);
    if (token) await launch(tenantId, token);
  };

  // Boot: launch every tenant that currently has a telegram token.
  const bootAll = async () => {
    const { tenantSettings } = await import('@dental/db-schema');
    const rows = await deps.adminDb.select({ tenantId: tenantSettings.tenantId, s: tenantSettings.integrationSettings }).from(tenantSettings);
    for (const r of rows) {
      const enc = (r.s as { telegram?: { botTokenEnc?: string } } | null)?.telegram?.botTokenEnc;
      if (enc) await launch(r.tenantId, decryptSecret(enc));
    }
  };

  // Redis pub/sub reload channel.
  const sub = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  sub.subscribe('telegram:reload');
  sub.on('message', (_ch, tenantId) => {
    void reload(tenantId).catch((err) => logger.error({ err, tenantId }, 'bot reload failed'));
  });

  void bootAll().catch((err) => logger.error({ err }, 'bot bootAll failed'));

  const stopAll = async () => {
    for (const [, bot] of bots) bot.stop('shutdown');
    bots.clear();
    await sub.quit();
  };

  return { reload, stopAll };
}
```

Add `telegraf` + `ioredis` to `apps/api/package.json` deps if not present (`bun add telegraf ioredis` in `apps/api`). Also: in `tenant-settings.service.ts::update`, after writing a telegram change, publish reload — add a `redisPub` (new `IORedis(env.REDIS_URL)`) call `redisPub.publish('telegram:reload', tenantId)` (inject or lazy-create; keep it best-effort, wrapped in try/catch so settings save never fails on Redis).

- [ ] **Step 4: Run test — verify pass**

Run: `cd apps/api && bun test src/lib/telegram-bot-manager.test.ts`
Expected: PASS (normalizePhone).

- [ ] **Step 5: Typecheck + commit**

```bash
bun --filter @dental/api typecheck
bunx biome check --write apps/api/src/lib/telegram-bot-manager.ts apps/api/src/lib/telegram-bot-manager.test.ts apps/api/src/modules/tenant-settings/tenant-settings.service.ts apps/api/package.json
git add apps/api/src/lib/telegram-bot-manager.ts apps/api/src/lib/telegram-bot-manager.test.ts apps/api/src/modules/tenant-settings apps/api/package.json
git commit -m "feat(api): per-tenant Telegram bot-manager (contact-link + Redis reload) (CLI-379)"
```

---

### Task 6: Boot bot-manager in worker process

**Files:**
- Modify: `apps/api/src/worker.ts`
- Modify: `apps/api/src/lib/recall-worker.ts` (export `createAdminDb` reuse) — reuse `createAdminDb` + `withTenant`.

**Interfaces:**
- Consumes: `startTelegramBotManager` (Task 5), `createAdminDb`, `withTenant`.

- [ ] **Step 1: Wire into worker.ts**

After the recall worker block in `worker.ts`, add:

```ts
const { createAdminDb } = await import('./db/client.ts');
const { withTenant } = await import('./db/scoped.ts');
const { startTelegramBotManager } = await import('./lib/telegram-bot-manager.ts');
const admin = createAdminDb();
const botManager = startTelegramBotManager({ adminDb: admin.db, withTenant });
logger.info('🛠️  Telegram bot-manager started');
```
Add `botManager.stopAll()` + `admin.client.end()` to any existing SIGINT/SIGTERM shutdown handler (or add one mirroring bot skeleton's graceful stop).

- [ ] **Step 2: Typecheck**

Run: `bun --filter @dental/api typecheck`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```bash
bunx biome check --write apps/api/src/worker.ts
git add apps/api/src/worker.ts
git commit -m "feat(api): boot Telegram bot-manager in worker process (CLI-379)"
```

---

### Task 7: Worker per-tenant channel resolution

**Files:**
- Create: `apps/api/src/lib/tenant-channel.ts`
- Modify: `apps/api/src/lib/recall-worker.ts`
- Modify: `apps/api/src/lib/reminder-worker.ts`
- Test: `apps/api/tests/integration/cli-379-per-tenant-channel.test.ts`

**Interfaces:**
- Consumes: `decryptSecret`, `createTelegramChannel`, `createEskizChannel`, `createNoOpChannel`, `patients.telegramChatId`.
- Produces: `resolveTenantChannel(settings: Record<string,unknown> | null, telegramChatId: string | null, patientPhone: string | null): { channel: NotificationChannel, to: string | null }` — Telegram(chat_id) > Eskiz(phone) > NoOp.

- [ ] **Step 1: Write failing integration test**

```ts
// cli-379-per-tenant-channel.test.ts — real DB (5433), tenant with telegram creds
// Seed a tenant_settings row with encrypted telegram token + a patient with telegramChatId,
// run processRecallScan with a tracking sms/telegram spy, assert Telegram path chosen when
// chatId present, Eskiz when only sms configured, NoOp when neither.
```
(Full seed mirrors `recall-worker.test.ts`; assert on which channel the tracking spy received the send + `to` value.)

- [ ] **Step 2: Run — verify fail**; **Step 3: Implement** `tenant-channel.ts`:

```ts
// apps/api/src/lib/tenant-channel.ts
import {
  createEskizChannel,
  createNoOpChannel,
  createTelegramChannel,
  type NotificationChannel,
} from '@dental/notifications';
import { decryptSecret } from './crypto.ts';

export const resolveTenantChannel = (
  settings: Record<string, unknown> | null,
  telegramChatId: string | null,
  patientPhone: string | null,
): { channel: NotificationChannel; to: string | null } => {
  const tg = (settings?.telegram ?? null) as { botTokenEnc?: string } | null;
  const sms = (settings?.sms ?? null) as { eskizEmailEnc?: string; eskizPasswordEnc?: string } | null;
  if (telegramChatId && tg?.botTokenEnc) {
    return { channel: createTelegramChannel({ botToken: decryptSecret(tg.botTokenEnc) }), to: telegramChatId };
  }
  if (patientPhone && sms?.eskizEmailEnc && sms?.eskizPasswordEnc) {
    return {
      channel: createEskizChannel({
        email: decryptSecret(sms.eskizEmailEnc),
        password: decryptSecret(sms.eskizPasswordEnc),
      }),
      to: patientPhone,
    };
  }
  return { channel: createNoOpChannel(), to: patientPhone };
};
```

- [ ] **Step 4: Rewire recall-worker + reminder-worker**

In `recall-worker.ts`: extend the `due` admin query to select `tenantSettings.integrationSettings` + `patients.telegramChatId`; inside `withTenant`, replace the module-level `deps.sms` with `resolveTenantChannel(row.integrationSettings, row.telegramChatId, targetPhone)` — send via that channel to its `to`. Keep the L8 emergency-fallback for `to` when phone-based. Remove `deps.sms` injection (or keep for tests as a spy override). Mirror in `reminder-worker.ts` inside `processReminderJob`.

- [ ] **Step 5: Run integration test (5433, isolated)** — verify pass; **Step 6: regression** run `recall-worker.test.ts` + `reminder-no-phone.test.ts` individually. **Step 7: Commit**

```bash
bunx biome check --write apps/api/src/lib
git add apps/api/src/lib apps/api/tests/integration/cli-379-per-tenant-channel.test.ts
git commit -m "feat(api): recall/reminder workers use per-tenant channel (Telegram>SMS>NoOp) (CLI-379/400)"
```

---

### Task 8: Web settings Integrations UI

**Files:**
- Modify: web settings feature (locate via `grep -rl "settings/integrations\|integrationSettings" apps/web/src`)
- Modify: `packages/i18n/src/locales/{uz,ru}.json`

**Interfaces:**
- Consumes: generated `updateTenantSettings` + `TenantSettings` DTO (`integrationSettings.telegram.configured/hint`), `POST integrations/test` generated fn.

- [ ] **Step 1: Add Integrations card** — Telegram input (`[bot token] [Tekshir]`) + Eskiz (`[email] [parol] [Tekshir]`), each showing `configured` badge + `hint`. Tekshir → `integrationsTest` mutation → toast ok/fail. Save → `updateTenantSettings({ telegram: { botToken } })` / `({ sms: {...} })`. Use existing settings form patterns; `zod4Resolver`; `formatCurrency`-style i18n via `t()`.
- [ ] **Step 2: i18n keys** (`settings.integrations.*`) uz/ru.
- [ ] **Step 3: typecheck --force + web test** (`bunx vitest run src/features/settings`) + **Step 4: Commit**

```bash
bunx biome check --write apps/web packages/i18n
git add apps/web packages/i18n
git commit -m "feat(web): settings Integrations card — Telegram/Eskiz credentials + test (CLI-379/400)"
```

---

### Task 9: Cleanup — remove apps/telegram-bot + legacy env

**Files:**
- Delete: `apps/telegram-bot/`
- Modify: root `package.json` (workspaces), `turbo.json` if it lists the app
- Modify: `apps/api/src/lib/env-schema.ts` — drop `TELEGRAM_BOT_TOKEN`, `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`
- Modify: `packages/notifications/src/index.ts` — `createNotificationChannel(env)` no longer used by workers; keep `createTelegramChannel`/`createEskizChannel`/`createSmsChannel` (used by `resolveTenantChannel`); remove the env-reading `createNotificationChannel` if now unreferenced (grep first).

- [ ] **Step 1: grep for remaining references**

Run: `grep -rn "TELEGRAM_BOT_TOKEN\|ESKIZ_EMAIL\|ESKIZ_PASSWORD\|apps/telegram-bot\|@dental/telegram-bot\|createNotificationChannel" apps packages --include=*.ts | grep -v node_modules`
Fix each: workers already migrated (Task 7); remove env fields; drop the app.

- [ ] **Step 2: Delete app + update workspaces**

```bash
git rm -r apps/telegram-bot
# edit root package.json "workspaces" to drop apps/telegram-bot if listed explicitly
```

- [ ] **Step 3: Full typecheck + check:rls + biome**

Run: `bun run typecheck --force && bun run check:rls && bunx biome check apps packages`
Expected: typecheck 17 tasks (was 18 minus telegram-bot) EXIT 0; check:rls 38.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove apps/telegram-bot + legacy TELEGRAM/ESKIZ env (per-tenant DB now) (CLI-379/400)"
```

---

## Final verification (before declaring done)

- [ ] Full API unit suite (`bun test src/ --env-file=<sp>/.env.5433`) — 8 license fails are pre-existing test-order isolation, not regressions (run license.test.ts alone → 0 fail to confirm).
- [ ] At-risk integration files individually (5433): `cli-379-per-tenant-channel`, `recall-worker`, `reminder-no-phone`, `tenant-settings`.
- [ ] `bun run typecheck --force` (18→17 tasks) + `check:rls` 38 + web `vitest run`.
- [ ] Mark CLI-379 + CLI-400 Done in Linear after merge.
- [ ] ⚠️ Telegram bot long-poll + contact-share = live external Telegram — unit/integration tests cover logic (mocked Telegraf/DB); a real BotFather token smoke on the actual bot is a manual step (like desktop Electron runtime).
