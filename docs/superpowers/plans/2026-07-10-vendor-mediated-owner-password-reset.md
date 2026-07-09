# Vendor-mediated Owner Password Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desktop'da klinika egasi parolini unutsa, vendor Supervisor admin panelidan bir martalik token beradi; mijoz desktop'da token + yangi parolni kiritadi; faqat tenant owner `password_hash` o'zgaradi (litsenziya/DB tegilmaydi).

**Architecture:** Supervisor `license_reset_tokens` jadval + admin-generatsiya (adminJWT) + public `verify-reset` (online, atomik consume). Desktop `license-client`'ga `verifyReset` + public `POST /api/reset-owner-password` (verify → `tenants.owner_user_id` → bcrypt `hashPassword`). Web public `/reset-owner-password` sahifa.

**Tech Stack:** Bun, Hono (Supervisor: plain Hono + `zValidator`; dental-api: `@hono/zod-openapi`), Drizzle, Zod 4, `node:crypto` (token gen + SHA-256 hash), `lib/password.ts` (bcrypt via `hashPassword`/`verifyPassword`), React+Mantine (web + supervisor-admin).

## Global Constraints

- **Supervisor is a SEPARATE app** (`apps/supervisor-api`/`apps/supervisor-admin`, `@supervisor/*`) with its OWN DB (a `supervisor` database on the same Postgres instance) and its OWN patterns: plain `Hono` + `zValidator` routes (NOT `@hono/zod-openapi`), `adminJwtMiddleware` for admin-only. Follow supervisor's existing `licenses.routes.ts`/`licenses.service.ts` style, not dental-api's.
- **dental-api** (`apps/api`): `@hono/zod-openapi` + `okJson`; public routes bypass auth via `license-middleware.ts` WHITELIST + `rateLimit`; secrets never logged.
- **Only owner password_hash changes** — the reset touches `users.password_hash` for `tenants.owner_user_id` ONLY. Never the license, `.lic` file, tenant, or other users.
- **Token:** `XXXXX-XXXXX-XXXXX` (3 segments of 5 hex-upper chars, same generator style as `clinics.routes.ts:146`: `crypto.randomBytes(3).toString('hex').toUpperCase().slice(0,5)`). Stored as SHA-256 hash; raw shown once. 24h expiry. One-time (atomic `consumed_at`).
- **DB tests:** dental-api integration → `dental-postgres` host port **5433**, env `/tmp/claude-1000/-home-madrimov-Projects-dental-service/36f5e07f-a999-4881-9d7d-cf2e7fa067e0/scratchpad/.env.5433`. Supervisor tests use the `supervisor` DB — check `apps/supervisor-api`'s own test setup/`.env` for how its existing tests connect (they already pass; mirror them). Run integration files individually (TRUNCATE race).
- **Commit trailer:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure

- **Modify** `apps/supervisor-api/src/db/schema.ts` — add `licenseResetTokens` table; extend `license_events.event` comment with `'password_reset'`.
- **Create** `apps/supervisor-api/drizzle/` migration (supervisor's own migration dir/flow — check how it generates).
- **Modify** `apps/supervisor-api/src/modules/licenses/licenses.service.ts` — add `createResetToken(licenseId)` + `verifyReset(licenseKey, fingerprint, resetToken)`.
- **Modify** `apps/supervisor-api/src/modules/licenses/licenses.routes.ts` — add `POST /:id/reset-token` (adminJWT) + `POST /verify-reset` (public).
- **Modify** `apps/api/src/lib/license-client.ts` — add `verifyReset(resetToken)`.
- **Create** `apps/api/src/routes/reset-owner-password.ts` — public route.
- **Modify** `apps/api/src/lib/license-middleware.ts` — add `/api/reset-owner-password` to WHITELIST.
- **Modify** `apps/api/src/app.ts` — mount the reset route.
- **Create** `apps/web/src/features/auth/pages/reset-owner-password.page.tsx` (or the feature's page convention) + route registration; **modify** LoginPage — add the "forgot password" link.
- **Modify** `apps/supervisor-admin` license detail page — "Generate reset token" button + one-time display.
- **Modify** `packages/i18n/src/locales/{uz,ru}.json` — reset UI strings (dental web).

---

### Task 1: Supervisor — `license_reset_tokens` table + migration

**Files:**
- Modify: `apps/supervisor-api/src/db/schema.ts`
- Create: supervisor migration (via its own `drizzle:generate` — inspect `apps/supervisor-api/package.json` scripts first)

**Interfaces:**
- Produces: `licenseResetTokens` table — `id` (uuid pk), `licenseId` (uuid FK → licenses, cascade), `tokenHash` (text), `fingerprint` (text nullable), `expiresAt` (timestamp), `consumedAt` (timestamp nullable), `createdBy` (text/uuid — admin id), `createdAt` (timestamp default now).

- [ ] **Step 1: Add table to schema**

In `apps/supervisor-api/src/db/schema.ts`, after `licenseEvents` (mirror its column style — the file uses `text`/`uuid`/`timestamp` from `drizzle-orm/pg-core`):

```ts
export const licenseResetTokens = pgTable('license_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  licenseId: uuid('license_id')
    .notNull()
    .references(() => licenses.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  fingerprint: text('fingerprint'),
  expiresAt: timestamp('expires_at').notNull(),
  consumedAt: timestamp('consumed_at'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
export type LicenseResetTokens = typeof licenseResetTokens.$inferSelect;
```
(Use `defaultRandom()`/`defaultNow()` matching how `licenses`/`licenseEvents` define defaults in THIS file — if they use `sql\`gen_random_uuid()\``, match that instead. Read the existing table defs first.)

- [ ] **Step 2: Generate + apply the supervisor migration**

Inspect `apps/supervisor-api/package.json` for its drizzle scripts (`db:generate`/`db:migrate`), run the generate, read the produced SQL (only the new table + FK), and apply it to the supervisor DB (the same command its existing tests/dev use — find it in the package scripts + its `.env`). Confirm the table exists.

- [ ] **Step 3: Typecheck + commit**

Run: `bun --filter @supervisor/api typecheck` (or the correct filter — check the package name in `apps/supervisor-api/package.json`). Expected EXIT 0.

```bash
git add apps/supervisor-api/src/db/schema.ts apps/supervisor-api/drizzle/
git commit -m "feat(supervisor): license_reset_tokens table (CLI-226 desktop owner reset)"
```

---

### Task 2: Supervisor — reset-token generation (admin)

**Files:**
- Modify: `apps/supervisor-api/src/modules/licenses/licenses.service.ts`
- Modify: `apps/supervisor-api/src/modules/licenses/licenses.routes.ts`
- Test: `apps/supervisor-api/src/modules/licenses/licenses.reset.test.ts` (or extend the existing licenses test — check for `licenses.test.ts`/`licenses.reset.test.ts`)

**Interfaces:**
- Consumes: `licenseResetTokens` (Task 1).
- Produces: `service.createResetToken(licenseId: string): Promise<{ resetToken: string; expiresAt: Date }>` — generates raw `XXXXX-XXXXX-XXXXX`, stores `sha256(raw)`, `expiresAt=now+24h`, invalidates prior unconsumed tokens for that license (set their `consumed_at=now` or delete), returns raw once. Route `POST /v1/admin/licenses/:id/reset-token` (adminJWT).

- [ ] **Step 1: Write failing service test**

```ts
// licenses.reset.test.ts (mirror the existing licenses test's DB setup)
import { describe, expect, test } from 'bun:test';
// seed a license, call service.createResetToken(licenseId)
test('createResetToken returns XXXXX-XXXXX-XXXXX + stores only the hash', async () => {
  const { resetToken } = await service.createResetToken(licenseId);
  expect(resetToken).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}-[0-9A-F]{5}$/);
  const [row] = await db.select().from(licenseResetTokens).where(eq(licenseResetTokens.licenseId, licenseId));
  expect(row.tokenHash).not.toBe(resetToken); // hashed, not raw
  expect(row.tokenHash).toBe(createHash('sha256').update(resetToken).digest('hex'));
  expect(row.consumedAt).toBeNull();
});
test('a new token invalidates the previous unconsumed one', async () => {
  await service.createResetToken(licenseId);
  await service.createResetToken(licenseId);
  const active = await db.select().from(licenseResetTokens)
    .where(and(eq(licenseResetTokens.licenseId, licenseId), isNull(licenseResetTokens.consumedAt)));
  expect(active).toHaveLength(1);
});
```

- [ ] **Step 2: Run — verify fail** (method missing).

- [ ] **Step 3: Implement `createResetToken`** in `licenses.service.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';
// ...
const genSegment = () => randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
const genResetToken = () => `${genSegment()}-${genSegment()}-${genSegment()}`;

async createResetToken(licenseId: string) {
  // invalidate prior unconsumed tokens
  await db.update(licenseResetTokens)
    .set({ consumedAt: new Date() })
    .where(and(eq(licenseResetTokens.licenseId, licenseId), isNull(licenseResetTokens.consumedAt)));
  const resetToken = genResetToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(licenseResetTokens).values({
    licenseId,
    tokenHash: createHash('sha256').update(resetToken).digest('hex'),
    expiresAt,
  });
  return { resetToken, expiresAt };
},
```
(Match the file's existing `db` import + `and`/`eq`/`isNull` from `drizzle-orm`.)

- [ ] **Step 4: Run test — pass.**

- [ ] **Step 5: Wire route** (`licenses.routes.ts`, mirror the `reactivate` route's `adminJwtMiddleware` + `zValidator` pattern):

```ts
app.post('/:id/reset-token', adminJwtMiddleware, async (c) => {
  const id = c.req.param('id');
  try {
    const data = await service.createResetToken(id);
    return c.json({ resetToken: data.resetToken, expiresAt: data.expiresAt });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});
```
(Confirm the admin licenses routes are mounted under `/v1/admin/licenses` — check where `licenseRoutes` is mounted in supervisor's `app.ts`; the reactivate route at `POST /reactivate` tells you the prefix.)

- [ ] **Step 6: Typecheck + biome + commit**

```bash
git add apps/supervisor-api/src/modules/licenses/
git commit -m "feat(supervisor): admin reset-token generation for license (CLI-226)"
```

---

### Task 3: Supervisor — public `verify-reset` (consume)

**Files:**
- Modify: `licenses.service.ts` + `licenses.routes.ts`
- Test: extend `licenses.reset.test.ts`

**Interfaces:**
- Produces: `service.verifyReset(licenseKey, fingerprint, resetToken): Promise<{ ok: boolean }>` — finds the license by key; finds an unconsumed, unexpired token whose `token_hash = sha256(resetToken)`; if the token row has a non-null `fingerprint` it must equal the supplied one; on match atomically sets `consumed_at=now` and writes a `license_events` `'password_reset'` row; returns `{ ok }`. Route `POST /v1/verify-reset` (public).

- [ ] **Step 1: Write failing tests** (valid→consume→ok; expired→false; already-consumed→false; wrong token→false):

```ts
test('valid token → ok:true, consumed, event written', async () => {
  const { resetToken } = await service.createResetToken(licenseId);
  const res = await service.verifyReset(licenseKey, fingerprint, resetToken);
  expect(res.ok).toBe(true);
  // second use fails (consumed)
  expect((await service.verifyReset(licenseKey, fingerprint, resetToken)).ok).toBe(false);
});
test('expired token → ok:false', async () => { /* insert a token row with expiresAt in the past → verifyReset false */ });
test('wrong token → ok:false', async () => {
  await service.createResetToken(licenseId);
  expect((await service.verifyReset(licenseKey, fingerprint, 'AAAAA-BBBBB-CCCCC')).ok).toBe(false);
});
```

- [ ] **Step 2: Run — fail. Step 3: Implement `verifyReset`:**

```ts
async verifyReset(licenseKey: string, fingerprint: string, resetToken: string) {
  const lic = await db.query.licenses.findFirst({ where: eq(licenses.licenseKey, licenseKey) });
  if (!lic) return { ok: false as const };
  const hash = createHash('sha256').update(resetToken).digest('hex');
  const [tok] = await db.select().from(licenseResetTokens).where(
    and(
      eq(licenseResetTokens.licenseId, lic.id),
      eq(licenseResetTokens.tokenHash, hash),
      isNull(licenseResetTokens.consumedAt),
      gt(licenseResetTokens.expiresAt, new Date()),
    ),
  ).limit(1);
  if (!tok) return { ok: false as const };
  if (tok.fingerprint && tok.fingerprint !== fingerprint) return { ok: false as const };
  // atomic consume: only succeed if still unconsumed
  const consumed = await db.update(licenseResetTokens)
    .set({ consumedAt: new Date() })
    .where(and(eq(licenseResetTokens.id, tok.id), isNull(licenseResetTokens.consumedAt)))
    .returning();
  if (consumed.length === 0) return { ok: false as const };
  await db.insert(licenseEvents).values({ licenseId: lic.id, event: 'password_reset', fingerprint });
  return { ok: true as const };
},
```
(Add `gt` to the drizzle import. Match `licenseEvents` insert shape to the existing `activate` event insert in this file.)

- [ ] **Step 4: Run — pass. Step 5: Wire public route** (mirror `/activate` — NO adminJwt):

```ts
const verifyResetSchema = z.object({ licenseKey: z.string().min(1), fingerprint: z.string().min(1), resetToken: z.string().min(1) });
app.post('/verify-reset', zValidator('json', verifyResetSchema), async (c) => {
  const { licenseKey, fingerprint, resetToken } = c.req.valid('json');
  const data = await service.verifyReset(licenseKey, fingerprint, resetToken);
  return c.json(data, data.ok ? 200 : 400);
});
```
(Mount it on the PUBLIC licenses router — same one `/activate` and `/heartbeat` use, NOT the admin-mounted one. Check supervisor's `app.ts`: activate/heartbeat are public, reactivate is admin — put verify-reset with activate/heartbeat.)

- [ ] **Step 6: Typecheck + biome + commit**

```bash
git add apps/supervisor-api/src/modules/licenses/
git commit -m "feat(supervisor): public verify-reset (one-time consume + event) (CLI-226)"
```

---

### Task 4: Desktop API — `POST /api/reset-owner-password`

**Files:**
- Modify: `apps/api/src/lib/license-client.ts` (add `verifyReset`)
- Create: `apps/api/src/routes/reset-owner-password.ts`
- Modify: `apps/api/src/lib/license-middleware.ts` (WHITELIST) + `apps/api/src/app.ts` (mount)
- Test: `apps/api/tests/integration/cli-226-owner-reset.test.ts`

**Interfaces:**
- Consumes: supervisor `verify-reset` (Task 3), `readLicense()` (→ `licenseKey`+`fingerprint`), `hashPassword` (`lib/password.ts`), `tenants.ownerUserId`.
- Produces: `verifyReset(resetToken: string): Promise<{ ok: boolean }>` in license-client; route `POST /api/reset-owner-password` `{ resetToken, newPassword }` → 200 on success, 400 `reset.invalid_token` / `reset.no_license`.

- [ ] **Step 1: Add `verifyReset` to license-client.ts** (mirror `activateLicense`):

```ts
export const verifyReset = async (resetToken: string): Promise<{ ok: boolean }> => {
  const lic = await readLicense(); // { licenseKey, fingerprint, ... } | null
  if (!lic) return { ok: false };
  const fingerprint = await getFingerprint();
  return post('/v1/verify-reset', { licenseKey: lic.licenseKey, fingerprint, resetToken });
};
```
(Import `readLicense` from `./license.ts`. If `post` throws on non-2xx, catch → `{ ok:false }`.)

- [ ] **Step 2: Write failing integration test** (real DB 5433, injected supervisor-verify so no network):

Design the route to accept an injectable `verifyReset` dep (default = the real license-client one) so the test injects a fake. Seed a tenant + owner user with a known password_hash. Assert:
- fake verify returns `{ok:true}` + a new password → owner's `password_hash` changed (verifyPassword(newPassword) true), and NO other user / the license row / tenant row changed.
- fake verify `{ok:false}` → 400, owner hash unchanged.

```ts
// cli-226-owner-reset.test.ts — call the route handler / service with injected verifyReset
```

- [ ] **Step 3: Implement the route** `apps/api/src/routes/reset-owner-password.ts`:

```ts
import { fail, ok } from '@dental/core';
import { tenants, users } from '@dental/db-schema';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client.ts';
import { verifyReset as defaultVerifyReset } from '../lib/license-client.ts';
import { hashPassword } from '../lib/password.ts';
import { rateLimit } from '../middleware/rate-limit.ts'; // match activate.ts's import

export const resetOwnerPasswordRoutes = (
  deps: { verifyReset?: (t: string) => Promise<{ ok: boolean }> } = {},
) => {
  const verifyReset = deps.verifyReset ?? defaultVerifyReset;
  const app = new Hono();
  const limiter = rateLimit({ name: 'reset-owner-password', /* mirror activate.ts limits */ });
  app.post('/', limiter, async (c) => {
    const json = await c.req.json().catch(() => null);
    const newPassword = (json as { newPassword?: string })?.newPassword;
    const resetToken = (json as { resetToken?: string })?.resetToken;
    if (!resetToken || !newPassword || newPassword.length < 8) {
      return c.json(fail('INVALID_REQUEST', 'resetToken va newPassword (>=8) majburiy'), 400);
    }
    const v = await verifyReset(resetToken);
    if (!v.ok) return c.json(fail('reset.invalid_token', 'Token yaroqsiz yoki muddati o‘tgan'), 400);
    // Desktop = single tenant; owner = tenants.owner_user_id.
    const tenant = await db.query.tenants.findFirst();
    if (!tenant) return c.json(fail('reset.no_tenant', 'Tenant topilmadi'), 400);
    const passwordHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, tenant.ownerUserId));
    return c.json(ok({ success: true }), 200);
  });
  return app;
};
```
(Adjust imports/`rateLimit` signature to match `activate.ts` exactly — read it. `db.query.tenants.findFirst()` is fine for desktop's single tenant; if the codebase forbids the unscoped `db` here, use the same `db` `activate.ts`/migrations use — this is a platform-level, pre-auth op like activate, so the RLS `getDb(c)` path doesn't apply.)

- [ ] **Step 4: Whitelist + mount.** In `license-middleware.ts`: `const WHITELIST = ['/activate', '/api/activate', '/api/reset-owner-password'];`. In `app.ts`: `app.route('/api/reset-owner-password', resetOwnerPasswordRoutes());` near the `activateRoutes` mount.

- [ ] **Step 5: Run integration test — pass. Step 6: typecheck + biome + commit**

```bash
git commit -m "feat(api): POST /api/reset-owner-password (vendor-token → owner password_hash) (CLI-226)"
```

---

### Task 5: Web — reset-owner-password page + login link

**Files:**
- Create: `apps/web/src/features/auth/pages/reset-owner-password.page.tsx` (+ route registration — follow how `activate.page.tsx` registers a public route)
- Modify: LoginPage (add the forgot-password link)
- Modify: `packages/i18n/src/locales/{uz,ru}.json`

**Interfaces:**
- Consumes: `POST /api/reset-owner-password` (raw fetch is acceptable here IF activate.page.tsx uses raw fetch for /api/activate — mirror it; otherwise use the generated client if one exists for activate).

- [ ] **Step 1: Build the page** — mirror `activate.page.tsx` (public, no auth). Form: `resetToken` (XXXXX-XXXXX-XXXXX) + `newPassword` + confirm (`zod4Resolver`, passwords match + min 8) → POST `/api/reset-owner-password` → success toast → navigate to login. Error toast on 400 (`reset.invalid_token` → localized message).
- [ ] **Step 2: Register the public route** the same way `/activate` is registered (grep `activate` in `apps/web/src/app/routes.tsx` or the routing registry).
- [ ] **Step 3: LoginPage link** — "Parolni unutdingizmi? Xizmat ko'rsatuvchiga murojaat qiling" → `/reset-owner-password`.
- [ ] **Step 4: i18n** `auth.reset_owner.*` uz + ru.
- [ ] **Step 5: typecheck --force + web test** (a render/submit test mirroring activate.page's test if one exists) + biome + commit

```bash
git commit -m "feat(web): reset-owner-password page + login link (CLI-226)"
```

---

### Task 6: Supervisor admin — "Generate reset token" on license detail

**Files:**
- Modify: `apps/supervisor-admin` license detail page (grep `reactivate` in `apps/supervisor-admin/src` to find where the reactivate action lives — put the reset-token button beside it)

**Interfaces:**
- Consumes: `POST /v1/admin/licenses/:id/reset-token` (Task 2). Admin panel already has the admin JWT / fetch pattern for reactivate.

- [ ] **Step 1: Add the button + one-time display** — on the license detail page, a "Parol-tiklash tokeni yaratish" button that POSTs to `/:id/reset-token` and shows the returned raw `resetToken` in a copyable field with a note "Bir marta ko'rsatiladi — mijozga bering. 24 soat amal qiladi." Mirror the existing reactivate button's fetch/auth wiring (it already sends the admin JWT).
- [ ] **Step 2: typecheck + biome + commit**

```bash
git commit -m "feat(supervisor-admin): generate reset-token button on license detail (CLI-226)"
```

---

## Final verification (before declaring done)

- [ ] Supervisor tests (its own runner/DB): reset service + verify-reset all green; supervisor typecheck EXIT 0.
- [ ] dental-api: `cli-226-owner-reset.test.ts` green (individually, 5433); `bun run typecheck --force` (17 pkgs) EXIT 0; `check:rls` 38 (no new tenant-scoped table — reset_tokens is supervisor-DB, not RLS-governed).
- [ ] Web: `vitest run` on the auth feature green.
- [ ] **Manual/live note:** the desktop→Supervisor `verify-reset` online call + the admin-panel token flow are external HTTP paths — unit/integration tests cover the logic (injected verifyReset, seeded supervisor DB); a real end-to-end (admin generates token → desktop resets) is a manual smoke like other Supervisor/desktop flows.
- [ ] Mark CLI-226 (or a new ticket) updated; note the relation in CLI-475 (auth SMS desktop) — this covers OWNER reset specifically, not general staff SMS.
