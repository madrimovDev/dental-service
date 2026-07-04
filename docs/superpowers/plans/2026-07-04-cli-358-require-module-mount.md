# CLI-358 Require-Module Mount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the already-written, already-unit-tested `requireModule(module)` middleware (`apps/api/src/lib/license-middleware.ts`) into the 11 route groups that correspond to `MODULE_MAP`'s module keys, so that a request to a gated endpoint on a machine with no active `.lic` license (or a license missing that module) gets a `403` — but **only in Local Desktop mode**, so cloud/dev/CI (which never provisions a `.lic`) is unaffected.

**Architecture:** Per RFC-0009, cross-cutting middleware (`authMiddleware`, `rlsMiddleware`) is already wired **inside each `<feature>.routes.ts` factory**, not centrally in `apps/api/src/app.ts`. This plan follows the same convention. **Critical correction found before writing any code** (would otherwise break the whole product/test-suite): `requireModule` unconditionally turns "no `.lic` file" into `403 LICENSE_NOT_FOUND`, and cloud/dev/CI environments never have a `.lic` (machine-fingerprint licensing is a Local-Desktop-only concept, per CLAUDE.md's "DS-LD" epic — the multi-tenant cloud SaaS has no per-machine license at all). Mounting `requireModule` unconditionally would 403 every request to all 11 route groups in every environment without a license file — including existing integration tests (`cli-79-vertical-gating.test.ts` hits `/api/patients/{id}/tooth-charts` under `clinicalRoutes`; `clinical.test.ts`, `cashier-*.test.ts`, `cli-186-187-appointments.test.ts`, etc. all traverse gated groups with no license provisioned) and any cloud/dev boot. **Fix:** a new wrapper `requireModuleInDesktop(module)` (added to `license-middleware.ts`, `requireModule`/`MODULE_MAP` themselves untouched) that no-ops unless `process.env.WEB_DIST_DIR` is set — the same signal `app.ts` already uses to detect Local Desktop mode (bitta-EXE, set by `apps/desktop/src/process-manager.ts`'s `spawnApi()`; never set in cloud/dev/CI). All 11 route groups consume `requireModuleInDesktop`, not `requireModule` directly.

**Tech Stack:** Bun, Hono, `apps/api/src/lib/license-middleware.ts` (`requireModule`, `MODULE_MAP` — not modified; `requireModuleInDesktop` — new, added here), `apps/api/src/lib/license.ts` (`getLicensePath()` re-reads `process.env.LICENSE_PATH` on every call — no caching, safe to override in tests; same pattern reused for `process.env.WEB_DIST_DIR` in the new wrapper).

## Global Constraints

- `requireModuleInDesktop('<key>')` is mounted as `app.use('*', requireModuleInDesktop('<key>'))`, the **first** `app.use(...)` call in each target factory — i.e. before the existing `app.use('*', authMiddleware())` / `app.use('*', rlsMiddleware(deps.db))` pair. Do not reorder those two relative to each other.
- The 11 module keys used **must be exactly** the strings in `MODULE_MAP` (`apps/api/src/lib/license-middleware.ts:43-60`): `patients`, `appointments`, `queue`, `cashier`, `reports`, `staff`, `clinical`, `lab-orders`, `patient-images`, `prescriptions`, `consent`. Do not invent new keys.
- Route groups **not** present in `MODULE_MAP` (`branches`, `roles`, `tenant`, `tenant-settings`, `permissions`, `audit`, `schedule`, `recalls`, `expenses`, `stock`, `payroll`, `notifications`, `service-categories`, `services`, `auth`, `health`, `activate`) are **out of scope** — do not add gating to them.
- **`requireModule` and `MODULE_MAP` themselves are NOT modified**, and the existing 6 tests in `apps/api/src/lib/license-middleware.test.ts` stay green, unchanged. Task 1 only **adds** a new `requireModuleInDesktop` export plus new, additional tests in the same file (new `describe` block, existing one untouched).
- `requireModuleInDesktop` must read `process.env.WEB_DIST_DIR` **fresh on every request** (not the frozen `env` singleton from `apps/api/src/lib/env.ts`, which is parsed once at first import and would go stale for the same reason `license.ts`'s own comment explains for `LICENSE_PATH`). This is what makes it possible for tests to toggle desktop-mode behavior at runtime.
- Import line for `requireModuleInDesktop` in every target file: `import { requireModuleInDesktop } from '../../lib/license-middleware.ts';`, placed alphabetically between the `../../lib/audit-logger.ts` (or `../../db/client.ts` when no audit-logger import exists) import and the `../../lib/openapi.ts` import.
- All new/modified tests use Bun's built-in test runner (`import { ... } from 'bun:test'`), run via `cd apps/api && bun test --env-file=../../.env <path>` — **not vitest** (that's `apps/web` only).
- The new integration test file (`apps/api/tests/integration/cli-358-module-gating.test.ts`) is built up incrementally, one `test(...)` per task (Tasks 2–12), inside a single `describe('CLI-358 requireModuleInDesktop mounted on gated route groups', ...)` block, sharing one `beforeAll`/`afterAll` harness that overrides **both** `process.env.LICENSE_PATH` (nonexistent path → `getActiveModules()` returns `[]`) **and** `process.env.WEB_DIST_DIR` (truthy dummy value → simulates Local Desktop mode) for the whole file, then restores both original values.
- Response envelope shape (from `packages/core/src/types/api-response.ts`, used by `fail()`): `{ success: false, error: { code: string, message: string, details?: unknown } }`. Assertions check `body.error.code`.

---

### Task 1: Add `requireModuleInDesktop` wrapper + its unit tests

**Files:**
- Modify: `apps/api/src/lib/license-middleware.ts` (append new export, existing `requireModule`/`MODULE_MAP` untouched)
- Modify: `apps/api/src/lib/license-middleware.test.ts` (append new `describe` block, existing 6 tests untouched)

**Interfaces:**
- Consumes: `requireModule(module: string): MiddlewareHandler` (existing, unmodified).
- Produces: `requireModuleInDesktop(module: string): MiddlewareHandler` — behaves exactly like `requireModule` when `process.env.WEB_DIST_DIR` is set, and is a pure pass-through (`next()`) when it is not.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/lib/license-middleware.test.ts` (after the existing `describe('requireModule', ...)` block, same file — existing 6 tests untouched):
```ts
describe('requireModuleInDesktop', () => {
  const originalWebDistDir = process.env.WEB_DIST_DIR;

  afterEach(() => {
    if (originalWebDistDir === undefined) {
      delete process.env.WEB_DIST_DIR;
    } else {
      process.env.WEB_DIST_DIR = originalWebDistDir;
    }
  });

  test('WEB_DIST_DIR yo\'q bo\'lsa (cloud/dev/CI) — litsenziya bo\'lmasa ham o\'tadi (no-op)', async () => {
    delete process.env.WEB_DIST_DIR;
    activeModules = [];
    const app = new Hono();
    app.get('/test', requireModuleInDesktop('patients'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });

  test('WEB_DIST_DIR bor bo\'lsa (Local Desktop) — requireModule kabi 403 LICENSE_NOT_FOUND qaytaradi', async () => {
    process.env.WEB_DIST_DIR = '/tmp/fake-web-dist';
    activeModules = [];
    const app = new Hono();
    app.get('/test', requireModuleInDesktop('patients'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });

  test('WEB_DIST_DIR bor + modul faol bo\'lsa — o\'tadi', async () => {
    process.env.WEB_DIST_DIR = '/tmp/fake-web-dist';
    activeModules = ['patients'];
    const app = new Hono();
    app.get('/test', requireModuleInDesktop('patients'), (c) => c.json({ ok: true }));
    const res = await app.request('/test');
    expect(res.status).toBe(200);
  });
});
```

Import line update at the top of the same file (add `afterEach` and `requireModuleInDesktop`):
```diff
-import { describe, expect, mock, test } from 'bun:test';
+import { afterEach, describe, expect, mock, test } from 'bun:test';
 import { Hono } from 'hono';
 import * as realLicense from './license';
 ...
-const { requireModule } = await import('./license-middleware');
+const { requireModule, requireModuleInDesktop } = await import('./license-middleware');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test --env-file=../../.env license-middleware`
Expected: FAIL — `requireModuleInDesktop` does not exist yet, import destructuring yields `undefined`, calling it as a middleware factory throws (`TypeError: requireModuleInDesktop is not a function`).

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/lib/license-middleware.ts` — append after the existing `MODULE_MAP` export:
```ts

/**
 * `requireModule` litsenziya tushunchasi (`.lic`, machine-fingerprint) FAQAT
 * Local Desktop (bitta-EXE, CLI-338/348) mahsulotiga tegishli — cloud/dev/CI
 * muhitida (multi-tenant SaaS) hech qachon `.lic` fayl yozilmaydi, shuning
 * uchun `requireModule`ni shartsiz ulash butun mavjud test suite'ni va
 * cloud deploy'ni buzadi (har doim LICENSE_NOT_FOUND).
 *
 * Bu wrapper `requireModule`ni `process.env.WEB_DIST_DIR` (Local Desktop
 * signali — `app.ts` CSP branch bilan bir xil, `process-manager.ts`
 * `spawnApi()` shu env'ni beradi) bilan shartlaydi: WEB_DIST_DIR yo'q bo'lsa
 * gating butunlay chetlab o'tiladi (no-op), bor bo'lsa `requireModule` bilan
 * bir xil ishlaydi.
 *
 * `process.env.WEB_DIST_DIR` har so'rovda qayta o'qiladi (frozen `env.ts`
 * singleton emas) — xuddi `getLicensePath()`dagi kabi (license.ts izohi:
 * top-level const bo'lsa import-vaqtida "muzlab qolar edi").
 */
export const requireModuleInDesktop = (module: string): MiddlewareHandler => {
  const gate = requireModule(module);
  return async (c, next) => {
    if (!process.env.WEB_DIST_DIR) {
      await next();
      return;
    }
    return gate(c, next);
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test --env-file=../../.env license-middleware`
(All 9 tests green — 6 existing `requireModule` tests unchanged + 3 new `requireModuleInDesktop` tests.)

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/lib/license-middleware.ts apps/api/src/lib/license-middleware.test.ts
git commit -m "$(cat <<'EOF'
feat(api): add requireModuleInDesktop wrapper — license gating is Local-Desktop-only

CLI-358 prep: requireModule's .lic/machine-fingerprint model only applies
to the Local Desktop product (CLI-338/348). Cloud/dev/CI never provisions
a .lic, so mounting requireModule unconditionally would 403 every gated
route everywhere except Local Desktop. requireModuleInDesktop no-ops
unless process.env.WEB_DIST_DIR (the existing Local Desktop signal, also
used by app.ts's CSP branch) is set. requireModule/MODULE_MAP and their
existing 6 tests are untouched.
EOF
)"
```

---

### Task 2: Wire `patients` module + create the integration test harness

**Files:**
- Modify: `apps/api/src/modules/patients/patients.routes.ts:4-5` (import), `apps/api/src/modules/patients/patients.routes.ts:70-73` (middleware chain)
- Create: `apps/api/tests/integration/cli-358-module-gating.test.ts`

**Interfaces:**
- Consumes: `requireModuleInDesktop(module: string): MiddlewareHandler` (Task 1); `createApp()` from `apps/api/src/app.ts`.
- Produces: `GET /api/patients` in simulated Local Desktop mode (`WEB_DIST_DIR` set) without a license → `403 { success:false, error:{ code:'LICENSE_NOT_FOUND' } }`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/cli-358-module-gating.test.ts`:
```ts
/**
 * Module-gating integration test (CLI-358) — `requireModuleInDesktop`
 * litsenziya-gating middleware'ni REAL to'liq app (`createApp()`) ustida
 * tekshiradi.
 *
 * Maqsad: Local Desktop rejimida (`WEB_DIST_DIR` bor) litsenziya
 * faollashtirilmagan (`.lic` fayl yo'q) holatda modul-gated route'lar 403
 * `LICENSE_NOT_FOUND` qaytarishi kerak — Local Desktop litsenziya modeli shu
 * tekshiruvga tayanadi (CLI-338/348), lekin CLI-358 topilishicha hech bir
 * route bu middleware'dan o'tmagan edi.
 *
 * `requireModuleInDesktop` faqat `process.env.WEB_DIST_DIR` bor bo'lganda
 * faollashadi (cloud/dev/CI'da no-op — Task 1 izohiga qarang), shuning uchun
 * bu fayl `beforeAll`da ikkalasini ham o'rnatadi: `LICENSE_PATH` (mavjud
 * bo'lmagan yo'l → litsenziya topilmadi) VA `WEB_DIST_DIR` (Local Desktop
 * rejimini simulyatsiya qilish uchun, haqiqiy build kerak emas — bu testlar
 * hech qachon static-serving branch'iga yetmaydi, /api/* route'lar
 * ustunroq mos keladi).
 *
 * `requireModuleInDesktop` har module route factory'sining ICHIDA, eng
 * birinchi middleware sifatida ulangan (auth/RLS'dan OLDIN) — shuning uchun
 * bu test Authorization header'siz ham 403 qaytishini tekshiradi.
 *
 * Talab: Postgres running, DATABASE_URL .env'da (createApp() DB pool ochadi,
 * lekin bu testlar hech qanday query yubormaydi — gating birinchi
 * middleware sifatida so'rovni auth/DB'ga yetmasdan bloklaydi).
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createApp } from '../../src/app.ts';

let originalLicensePath: string | undefined;
let originalWebDistDir: string | undefined;

beforeAll(() => {
  originalLicensePath = process.env.LICENSE_PATH;
  originalWebDistDir = process.env.WEB_DIST_DIR;

  // Mavjud bo'lmagan yo'l — getLicensePath() bu env'ni har chaqiruvda o'qiydi.
  process.env.LICENSE_PATH = `/tmp/cli-358-no-license-${crypto.randomUUID()}.lic`;
  // requireModuleInDesktop faqat WEB_DIST_DIR bor bo'lganda faollashadi —
  // Local Desktop rejimini simulyatsiya qilish uchun (haqiqiy web build
  // shart emas, /api/* so'rovlar static-serving branch'iga yetmaydi).
  process.env.WEB_DIST_DIR = '/tmp/cli-358-fake-web-dist';
});

afterAll(() => {
  if (originalLicensePath === undefined) {
    delete process.env.LICENSE_PATH;
  } else {
    process.env.LICENSE_PATH = originalLicensePath;
  }
  if (originalWebDistDir === undefined) {
    delete process.env.WEB_DIST_DIR;
  } else {
    process.env.WEB_DIST_DIR = originalWebDistDir;
  }
});

describe('CLI-358 requireModuleInDesktop mounted on gated route groups', () => {
  test('GET /api/patients (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/patients');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Expected: FAIL — `GET /api/patients` currently has no gating guard, so even with `WEB_DIST_DIR`/`LICENSE_PATH` set, the request falls straight through to `authMiddleware`, which returns `401 auth.missing_token`, not `403 LICENSE_NOT_FOUND`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/patients/patients.routes.ts` — import block (line 4-5):
```diff
 import type { Database } from '../../db/client.ts';
 import type { AuditLogger } from '../../lib/audit-logger.ts';
+import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
 import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
```

Middleware chain (line 70-73):
```diff
 export const patientRoutes = (deps: { db: Database; audit: AuditLogger }) => {
   const app = new OpenAPIHono();
+  app.use('*', requireModuleInDesktop('patients'));
   app.use('*', authMiddleware());
   app.use('*', rlsMiddleware(deps.db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Also regression: `cd apps/api && bun test --env-file=../../.env license-middleware`
Also regression (proves cloud/CI-mode tests are unaffected): `cd apps/api && bun test --env-file=../../.env cli-79-vertical-gating`

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/patients/patients.routes.ts apps/api/tests/integration/cli-358-module-gating.test.ts
git commit -m "$(cat <<'EOF'
fix(api): wire requireModuleInDesktop('patients') gating into patients route

CLI-358: requireModule was written and unit-tested but never mounted on
any route. Adds requireModuleInDesktop (Local-Desktop-only wrapper) as
the first middleware in patientRoutes, before auth/RLS, so unlicensed
Local Desktop installs get 403 LICENSE_NOT_FOUND on /api/patients
instead of silently succeeding — while cloud/dev/CI (no WEB_DIST_DIR)
stays unaffected.
EOF
)"
```

---

### Task 3: Wire `appointments` module

**Files:**
- Modify: `apps/api/src/modules/appointments/appointments.routes.ts:4-5` (import), `apps/api/src/modules/appointments/appointments.routes.ts:46-54` (middleware chain)
- Modify: `apps/api/tests/integration/cli-358-module-gating.test.ts` (append test)

**Interfaces:**
- Consumes: same `requireModuleInDesktop`.
- Produces: `GET /api/appointments` (Local Desktop, no license) → `403 LICENSE_NOT_FOUND`.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe(...)` block in `cli-358-module-gating.test.ts` (right after the patients test):
```ts
  test('GET /api/appointments (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/appointments');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Expected: FAIL — new test gets `401` (no guard yet on appointments), not `403`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/appointments/appointments.routes.ts` — import block (line 4-5):
```diff
 import type { Database } from '../../db/client.ts';
 import type { AuditLogger } from '../../lib/audit-logger.ts';
+import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
 import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
```

Middleware chain (line 46-54):
```diff
 export const appointmentRoutes = (deps: {
   db: Database;
   audit: AuditLogger;
   schedule?: SchedulePredicates;
   recall?: RecallAppointmentHook;
 }) => {
   const app = new OpenAPIHono();
+  app.use('*', requireModuleInDesktop('appointments'));
   app.use('*', authMiddleware());
   app.use('*', rlsMiddleware(deps.db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Also regression: `cd apps/api && bun test --env-file=../../.env license-middleware`

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/appointments/appointments.routes.ts apps/api/tests/integration/cli-358-module-gating.test.ts
git commit -m "$(cat <<'EOF'
fix(api): wire requireModuleInDesktop('appointments') gating into appointments route

CLI-358: same gap, appointments route group.
EOF
)"
```

---

### Task 4: Wire `queue` module

**Files:**
- Modify: `apps/api/src/modules/queue/queue.routes.ts:4-5` (import), `apps/api/src/modules/queue/queue.routes.ts:27-30` (middleware chain)
- Modify: `apps/api/tests/integration/cli-358-module-gating.test.ts` (append test)

**Interfaces:**
- Consumes: same `requireModuleInDesktop`.
- Produces: `GET /api/queue` (Local Desktop, no license) → `403 LICENSE_NOT_FOUND`.

- [ ] **Step 1: Write the failing test**

Append to the `describe(...)` block:
```ts
  test('GET /api/queue (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/queue');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Expected: FAIL — `401`, not `403`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/queue/queue.routes.ts` — import block (line 4-5):
```diff
 import type { Database } from '../../db/client.ts';
 import type { AuditLogger } from '../../lib/audit-logger.ts';
+import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
 import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
```

Middleware chain (line 27-30):
```diff
 export const queueRoutes = (deps: { db: Database; audit: AuditLogger }) => {
   const app = new OpenAPIHono();
+  app.use('*', requireModuleInDesktop('queue'));
   app.use('*', authMiddleware());
   app.use('*', rlsMiddleware(deps.db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Also regression: `cd apps/api && bun test --env-file=../../.env license-middleware`

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/queue/queue.routes.ts apps/api/tests/integration/cli-358-module-gating.test.ts
git commit -m "$(cat <<'EOF'
fix(api): wire requireModuleInDesktop('queue') gating into queue route

CLI-358: same gap, queue route group.
EOF
)"
```

---

### Task 5: Wire `cashier` module

**Files:**
- Modify: `apps/api/src/modules/cashier/cashier.routes.ts:5-6` (import), `apps/api/src/modules/cashier/cashier.routes.ts:35-42` (middleware chain)
- Modify: `apps/api/tests/integration/cli-358-module-gating.test.ts` (append test)

**Interfaces:**
- Consumes: same `requireModuleInDesktop`.
- Produces: `GET /api/cashier/transactions` (Local Desktop, no license) → `403 LICENSE_NOT_FOUND`.

- [ ] **Step 1: Write the failing test**

Append to the `describe(...)` block:
```ts
  test('GET /api/cashier/transactions (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/cashier/transactions');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Expected: FAIL — `401`, not `403`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/cashier/cashier.routes.ts` — import block (line 5-6):
```diff
 import type { Database } from '../../db/client.ts';
 import type { AuditLogger } from '../../lib/audit-logger.ts';
+import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
 import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
```

Middleware chain (line 35-42):
```diff
 export const cashierRoutes = (deps: {
   db: Database;
   audit: AuditLogger;
   fiscal?: FiscalProvider;
 }) => {
   const app = new OpenAPIHono();
+  app.use('*', requireModuleInDesktop('cashier'));
   app.use('*', authMiddleware());
   app.use('*', rlsMiddleware(deps.db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Also regression: `cd apps/api && bun test --env-file=../../.env license-middleware`

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/cashier/cashier.routes.ts apps/api/tests/integration/cli-358-module-gating.test.ts
git commit -m "$(cat <<'EOF'
fix(api): wire requireModuleInDesktop('cashier') gating into cashier route

CLI-358: same gap, cashier route group.
EOF
)"
```

---

### Task 6: Wire `reports` module

**Files:**
- Modify: `apps/api/src/modules/reports/reports.routes.ts:3-4` (import), `apps/api/src/modules/reports/reports.routes.ts:26-28` (middleware chain)
- Modify: `apps/api/tests/integration/cli-358-module-gating.test.ts` (append test)

**Interfaces:**
- Consumes: same `requireModuleInDesktop`.
- Produces: `GET /api/reports/revenue` (Local Desktop, no license) → `403 LICENSE_NOT_FOUND`.

- [ ] **Step 1: Write the failing test**

Append to the `describe(...)` block:
```ts
  test('GET /api/reports/revenue (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/reports/revenue');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Expected: FAIL — `401`, not `403`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/reports/reports.routes.ts` — import block (line 3-4; note: no `lib/audit-logger` import in this file, `reportsRoutes` only needs `db`):
```diff
 import type { Database } from '../../db/client.ts';
+import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
 import { okJson } from '../../lib/openapi.ts';
```

Middleware chain (line 26-28):
```diff
 export const reportsRoutes = (deps: { db: Database }) => {
   const app = new OpenAPIHono();
+  app.use('*', requireModuleInDesktop('reports'));
   app.use('*', authMiddleware());
   app.use('*', rlsMiddleware(deps.db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Also regression: `cd apps/api && bun test --env-file=../../.env license-middleware`

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/reports/reports.routes.ts apps/api/tests/integration/cli-358-module-gating.test.ts
git commit -m "$(cat <<'EOF'
fix(api): wire requireModuleInDesktop('reports') gating into reports route

CLI-358: same gap, reports route group.
EOF
)"
```

---

### Task 7: Wire `staff` module (`/api/users`)

**Files:**
- Modify: `apps/api/src/modules/users/users.routes.ts:4-5` (import), `apps/api/src/modules/users/users.routes.ts:42-45` (middleware chain)
- Modify: `apps/api/tests/integration/cli-358-module-gating.test.ts` (append test)

**Interfaces:**
- Consumes: same `requireModuleInDesktop`.
- Produces: `GET /api/users/assignments` (Local Desktop, no license) → `403 LICENSE_NOT_FOUND`.

**Note (mapping decision, documented in the spec):** `MODULE_MAP` has a `staff` key but no route group is literally named "staff" — the permission codes actually used on `/api/users` are `user.*` (`user.view`/`user.invite`/`user.manage`), not `staff.*` (which exist in `packages/core/src/permissions.ts` but are unused by any route). `/api/users` (staff invite/assignment/profile management) is the closest and only sensible match for the `staff` module key.

- [ ] **Step 1: Write the failing test**

Append to the `describe(...)` block:
```ts
  test('GET /api/users/assignments (Local Desktop, no license) → 403 LICENSE_NOT_FOUND (staff module)', async () => {
    const app = createApp();
    const res = await app.request('/api/users/assignments');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Expected: FAIL — `401`, not `403`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/users/users.routes.ts` — import block (line 4-5):
```diff
 import type { Database } from '../../db/client.ts';
 import type { AuditLogger } from '../../lib/audit-logger.ts';
+import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
 import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
```

Middleware chain (line 42-45):
```diff
 export const userRoutes = (deps: { db: Database; audit: AuditLogger }) => {
   const app = new OpenAPIHono();
+  app.use('*', requireModuleInDesktop('staff'));
   app.use('*', authMiddleware());
   app.use('*', rlsMiddleware(deps.db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Also regression: `cd apps/api && bun test --env-file=../../.env license-middleware`

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/users/users.routes.ts apps/api/tests/integration/cli-358-module-gating.test.ts
git commit -m "$(cat <<'EOF'
fix(api): wire requireModuleInDesktop('staff') gating into users route

CLI-358: MODULE_MAP's 'staff' key maps to /api/users (invite/assignment/
profile management) — the closest match, since no route group is
literally named "staff" and the staff.* permission codes in
packages/core/src/permissions.ts are unused by any route.
EOF
)"
```

---

### Task 8: Wire `clinical` module

**Files:**
- Modify: `apps/api/src/modules/clinical/clinical.routes.ts:3-4` (import), `apps/api/src/modules/clinical/clinical.routes.ts:25-32` (middleware chain)
- Modify: `apps/api/tests/integration/cli-358-module-gating.test.ts` (append test)

**Interfaces:**
- Consumes: same `requireModuleInDesktop`.
- Produces: `GET /api/treatment-plans` (one of `clinicalRoutes`' four sub-domains — diagnoses/treatment-plans/visit-notes/tooth-charts are all gated together under the single `clinical` key) — Local Desktop, no license → `403 LICENSE_NOT_FOUND`.

- [ ] **Step 1: Write the failing test**

Append to the `describe(...)` block:
```ts
  test('GET /api/treatment-plans (Local Desktop, no license) → 403 LICENSE_NOT_FOUND (clinical module)', async () => {
    const app = createApp();
    const res = await app.request('/api/treatment-plans');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Expected: FAIL — `401`, not `403`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/clinical/clinical.routes.ts` — import block (line 3-4; note: this file has no `lib/openapi.ts` import, insert before `middleware/auth.ts`):
```diff
 import type { Database } from '../../db/client.ts';
 import type { AuditLogger } from '../../lib/audit-logger.ts';
+import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
 import { authMiddleware } from '../../middleware/auth.ts';
```

Middleware chain (line 25-32):
```diff
 export const clinicalRoutes = (deps: {
   db: Database;
   audit: AuditLogger;
   recall?: RecallStageHook;
   notifications?: NotificationsService;
 }) => {
   const app = new OpenAPIHono();
+  app.use('*', requireModuleInDesktop('clinical'));
   app.use('*', authMiddleware());
   app.use('*', rlsMiddleware(deps.db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Also regression: `cd apps/api && bun test --env-file=../../.env license-middleware`
Also regression (clinical/CLI-79 tests run WITHOUT WEB_DIST_DIR — must stay green, proving gating is Local-Desktop-only): `cd apps/api && bun test --env-file=../../.env clinical` and `cd apps/api && bun test --env-file=../../.env cli-79-vertical-gating`

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/clinical/clinical.routes.ts apps/api/tests/integration/cli-358-module-gating.test.ts
git commit -m "$(cat <<'EOF'
fix(api): wire requireModuleInDesktop('clinical') gating into clinical route

CLI-358: gates all four clinical sub-domains (diagnoses, treatment-plans,
visit-notes, tooth-charts) together under the single 'clinical' key,
matching MODULE_MAP (no per-sub-domain key exists). Verified clinical.test.ts
and cli-79-vertical-gating.test.ts (no WEB_DIST_DIR set) stay green.
EOF
)"
```

---

### Task 9: Wire `lab-orders` module

**Files:**
- Modify: `apps/api/src/modules/lab-orders/lab-orders.routes.ts:4-5` (import), `apps/api/src/modules/lab-orders/lab-orders.routes.ts:29-32` (middleware chain)
- Modify: `apps/api/tests/integration/cli-358-module-gating.test.ts` (append test)

**Interfaces:**
- Consumes: same `requireModuleInDesktop`.
- Produces: `GET /api/lab-orders` (Local Desktop, no license) → `403 LICENSE_NOT_FOUND`.

- [ ] **Step 1: Write the failing test**

Append to the `describe(...)` block:
```ts
  test('GET /api/lab-orders (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/lab-orders');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Expected: FAIL — `401`, not `403`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/lab-orders/lab-orders.routes.ts` — import block (line 4-5):
```diff
 import type { Database } from '../../db/client.ts';
 import type { AuditLogger } from '../../lib/audit-logger.ts';
+import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
 import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
```

Middleware chain (line 29-32):
```diff
 export const labOrdersRoutes = (deps: { db: Database; audit: AuditLogger }) => {
   const app = new OpenAPIHono();
+  app.use('*', requireModuleInDesktop('lab-orders'));
   app.use('*', authMiddleware());
   app.use('*', rlsMiddleware(deps.db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Also regression: `cd apps/api && bun test --env-file=../../.env license-middleware`

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/lab-orders/lab-orders.routes.ts apps/api/tests/integration/cli-358-module-gating.test.ts
git commit -m "$(cat <<'EOF'
fix(api): wire requireModuleInDesktop('lab-orders') gating into lab-orders route

CLI-358: same gap, lab-orders route group.
EOF
)"
```

---

### Task 10: Wire `patient-images` module

**Files:**
- Modify: `apps/api/src/modules/patient-images/patient-images.routes.ts:5-6` (import), `apps/api/src/modules/patient-images/patient-images.routes.ts:33-36` (middleware chain)
- Modify: `apps/api/tests/integration/cli-358-module-gating.test.ts` (append test)

**Interfaces:**
- Consumes: same `requireModuleInDesktop`.
- Produces: `GET /api/patients/{patientId}/images` (Local Desktop, no license) → `403 LICENSE_NOT_FOUND`.

- [ ] **Step 1: Write the failing test**

Append to the `describe(...)` block:
```ts
  test('GET /api/patients/{id}/images (Local Desktop, no license) → 403 LICENSE_NOT_FOUND (patient-images module)', async () => {
    const app = createApp();
    const res = await app.request('/api/patients/11111111-1111-1111-1111-111111111111/images');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Expected: FAIL — `401`, not `403`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/patient-images/patient-images.routes.ts` — import block (line 5-6):
```diff
 import type { Database } from '../../db/client.ts';
 import type { AuditLogger } from '../../lib/audit-logger.ts';
+import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
 import { errorResponseSchema, okJson } from '../../lib/openapi.ts';
```

Middleware chain (line 33-36):
```diff
 export const patientImagesRoutes = (deps: { db: Database; audit: AuditLogger }) => {
   const app = new OpenAPIHono();
+  app.use('*', requireModuleInDesktop('patient-images'));
   app.use('*', authMiddleware());
   app.use('*', rlsMiddleware(deps.db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Also regression: `cd apps/api && bun test --env-file=../../.env license-middleware`

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/patient-images/patient-images.routes.ts apps/api/tests/integration/cli-358-module-gating.test.ts
git commit -m "$(cat <<'EOF'
fix(api): wire requireModuleInDesktop('patient-images') gating into patient-images route

CLI-358: same gap, patient-images route group.
EOF
)"
```

---

### Task 11: Wire `prescriptions` module

**Files:**
- Modify: `apps/api/src/modules/prescriptions/prescriptions.routes.ts:4-5` (import), `apps/api/src/modules/prescriptions/prescriptions.routes.ts:28-31` (middleware chain)
- Modify: `apps/api/tests/integration/cli-358-module-gating.test.ts` (append test)

**Interfaces:**
- Consumes: same `requireModuleInDesktop`.
- Produces: `GET /api/prescriptions` (Local Desktop, no license) → `403 LICENSE_NOT_FOUND`.

- [ ] **Step 1: Write the failing test**

Append to the `describe(...)` block:
```ts
  test('GET /api/prescriptions (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/prescriptions');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Expected: FAIL — `401`, not `403`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/prescriptions/prescriptions.routes.ts` — import block (line 4-5):
```diff
 import type { Database } from '../../db/client.ts';
 import type { AuditLogger } from '../../lib/audit-logger.ts';
+import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
 import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
```

Middleware chain (line 28-31):
```diff
 export const prescriptionsRoutes = (deps: { db: Database; audit: AuditLogger }) => {
   const app = new OpenAPIHono();
+  app.use('*', requireModuleInDesktop('prescriptions'));
   app.use('*', authMiddleware());
   app.use('*', rlsMiddleware(deps.db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Also regression: `cd apps/api && bun test --env-file=../../.env license-middleware`

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/prescriptions/prescriptions.routes.ts apps/api/tests/integration/cli-358-module-gating.test.ts
git commit -m "$(cat <<'EOF'
fix(api): wire requireModuleInDesktop('prescriptions') gating into prescriptions route

CLI-358: same gap, prescriptions route group.
EOF
)"
```

---

### Task 12: Wire `consent` module

**Files:**
- Modify: `apps/api/src/modules/consent/consent.routes.ts:4-5` (import), `apps/api/src/modules/consent/consent.routes.ts:30-33` (middleware chain)
- Modify: `apps/api/tests/integration/cli-358-module-gating.test.ts` (append test)

**Interfaces:**
- Consumes: same `requireModuleInDesktop`.
- Produces: `GET /api/consent/templates` (Local Desktop, no license) → `403 LICENSE_NOT_FOUND`.

- [ ] **Step 1: Write the failing test**

Append to the `describe(...)` block:
```ts
  test('GET /api/consent/templates (Local Desktop, no license) → 403 LICENSE_NOT_FOUND', async () => {
    const app = createApp();
    const res = await app.request('/api/consent/templates');
    expect(res.status).toBe(403);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).toBe('LICENSE_NOT_FOUND');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Expected: FAIL — `401`, not `403`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/consent/consent.routes.ts` — import block (line 4-5):
```diff
 import type { Database } from '../../db/client.ts';
 import type { AuditLogger } from '../../lib/audit-logger.ts';
+import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
 import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
```

Middleware chain (line 30-33):
```diff
 export const consentRoutes = (deps: { db: Database; audit: AuditLogger }) => {
   const app = new OpenAPIHono();
+  app.use('*', requireModuleInDesktop('consent'));
   app.use('*', authMiddleware());
   app.use('*', rlsMiddleware(deps.db));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Also regression: `cd apps/api && bun test --env-file=../../.env license-middleware`

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/modules/consent/consent.routes.ts apps/api/tests/integration/cli-358-module-gating.test.ts
git commit -m "$(cat <<'EOF'
fix(api): wire requireModuleInDesktop('consent') gating into consent route

CLI-358: same gap, consent route group. All 11 MODULE_MAP keys are now
wired: patients, appointments, queue, cashier, reports, staff, clinical,
lab-orders, patient-images, prescriptions, consent.
EOF
)"
```

---

### Task 13: Regression guards — cloud/CI mode unaffected + un-gated routes unaffected

**Files:**
- Modify: `apps/api/tests/integration/cli-358-module-gating.test.ts` (append tests, no source changes)

**Interfaces:**
- Consumes: `createApp()`.
- Produces: (a) proof that a gated route (`/api/patients`) does **NOT** 403 when `WEB_DIST_DIR` is unset — the critical guard that protects every existing cloud/dev/CI test and deployment from this ticket's change; (b) proof that a non-`MODULE_MAP` route (`/api/branches`) is unaffected even when `WEB_DIST_DIR` **is** set — proving the mount stayed selective (inside each factory) rather than an accidental blanket `app.use('*', requireModuleInDesktop(...))` in `app.ts`.

- [ ] **Step 1: Write the failing test**

Append to the `describe(...)` block. Both are regression guards — expected to already be green after Tasks 1–12 (this task adds no new gap, it locks in the two invariants the whole design depends on):
```ts
  test('GET /api/patients WITHOUT WEB_DIST_DIR (cloud/dev/CI mode) → gating is a no-op, never LICENSE_NOT_FOUND', async () => {
    // Simulates every other existing integration test (cli-79-vertical-gating,
    // clinical.test.ts, cashier-*.test.ts, ...) — none of them set WEB_DIST_DIR,
    // none of them provision a .lic. This is the guard that proves CLI-358
    // did not break the rest of the suite / cloud deploy.
    const savedWebDistDir = process.env.WEB_DIST_DIR;
    delete process.env.WEB_DIST_DIR;
    try {
      const app = createApp();
      const res = await app.request('/api/patients');
      // No Authorization header either — falls straight past the (no-op)
      // module gate to authMiddleware → 401, never 403 LICENSE_NOT_FOUND.
      expect(res.status).toBe(401);
      const body = (await res.json()) as { success: boolean; error: { code: string } };
      expect(body.error.code).not.toBe('LICENSE_NOT_FOUND');
      expect(body.error.code).toBe('auth.missing_token');
    } finally {
      if (savedWebDistDir === undefined) {
        delete process.env.WEB_DIST_DIR;
      } else {
        process.env.WEB_DIST_DIR = savedWebDistDir;
      }
    }
  });

  test('GET /api/branches (non-gated route, Local Desktop mode) → NOT LICENSE_NOT_FOUND (falls through to auth)', async () => {
    // /api/branches has no MODULE_MAP entry — requireModuleInDesktop must NOT
    // be mounted on it, even in simulated Local Desktop mode (WEB_DIST_DIR set
    // by the shared beforeAll harness). Without a license it should behave
    // exactly as before this ticket: no Authorization header → 401
    // auth.missing_token, never 403 LICENSE_NOT_FOUND.
    const app = createApp();
    const res = await app.request('/api/branches');
    expect(res.status).toBe(401);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.error.code).not.toBe('LICENSE_NOT_FOUND');
    expect(body.error.code).toBe('auth.missing_token');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test --env-file=../../.env cli-358-module-gating`
Expected: PASS already for both (Tasks 1-12 implemented gating correctly: `requireModuleInDesktop` no-ops without `WEB_DIST_DIR`, and it was only ever mounted inside the 11 target factories, never centrally in `app.ts`). If either test unexpectedly fails, it signals a real regression: the first failing would mean `requireModuleInDesktop`'s `WEB_DIST_DIR` check is broken or missing (Task 1 regressed) — this would break the entire existing test suite; the second failing would mean gating leaked to a non-`MODULE_MAP` route (an accidental global mount).

- [ ] **Step 3: Write minimal implementation**

No source implementation needed — Tasks 1-12 already implemented gating correctly. This task only adds the regression assertions.

- [ ] **Step 4: Run test to verify it passes**

Run full suite:
```bash
cd apps/api && bun test --env-file=../../.env cli-358-module-gating
cd apps/api && bun test --env-file=../../.env license-middleware
cd apps/api && bun test --env-file=../../.env cli-79-vertical-gating
cd apps/api && bun test --env-file=../../.env clinical
cd apps/api && bun run typecheck
```
All green.

- [ ] **Step 5: Commit**
```bash
git add apps/api/tests/integration/cli-358-module-gating.test.ts
git commit -m "$(cat <<'EOF'
test(api): add regression guards for CLI-358 module gating scope

Confirms (a) without WEB_DIST_DIR (cloud/dev/CI, every other existing
integration test's environment) gating is a true no-op — never
LICENSE_NOT_FOUND, and (b) /api/branches (no MODULE_MAP entry) is
unaffected even in simulated Local Desktop mode. Closes CLI-358: all 11
MODULE_MAP route groups gated behind requireModuleInDesktop,
license-middleware.test.ts (9/9: 6 existing + 3 new) green, full
existing integration suite unaffected.
EOF
)"
```

---

## Self-Review (placeholder / type consistency check)

- **No placeholders:** every task uses the real, already-read source: the exact `requireModule(module: string): MiddlewareHandler` signature and `MODULE_MAP` keys from `apps/api/src/lib/license-middleware.ts:19-60`, the exact import blocks and `app.use('*', authMiddleware())`/`rlsMiddleware(deps.db)` line numbers read from each of the 11 target `*.routes.ts` files, and real HTTP paths taken from each file's `createRoute({ path: '...' })` declarations — e.g. `/api/reports/revenue` (`reports.routes.ts:37`), `/api/consent/templates` (`consent.routes.ts:41`), `/api/patients/{patientId}/images` (`patient-images.routes.ts:43`), `/api/users/assignments` (`users.routes.ts:52`).
- **Critical correctness fix, not scope creep:** Task 1's `requireModuleInDesktop` wrapper was added only after tracing through what "no `.lic` file" actually means in every deployment mode (`readLicense()` → `null` → `getActiveModules()` → `[]` → unconditional `403`) and confirming, by reading `cli-79-vertical-gating.test.ts` end-to-end, that existing integration tests hit gated route groups with zero license provisioning. Without this fix, Tasks 2-12 as originally scoped ("just mount `requireModule`") would have broken the entire existing `apps/api/tests/integration/` suite and made cloud/dev deploys 403 on every gated endpoint. `requireModule`/`MODULE_MAP` themselves and their 6 existing tests are untouched — only a new, additively-tested wrapper was introduced.
- **Type consistency:** `requireModuleInDesktop('<key>')` returns `MiddlewareHandler`, same type as `authMiddleware()`/`rlsMiddleware(deps.db)` already passed to `app.use('*', ...)` in every target file — no new types introduced, `deps: { db: Database; audit?: AuditLogger }` signatures of each factory are untouched.
- **Test-runtime consistency:** all test code uses `bun:test` (`describe`/`test`/`expect`/`beforeAll`/`afterAll`/`afterEach`), matching `apps/api/src/lib/license-middleware.test.ts` and the rest of `apps/api/tests/integration/` — not vitest (that's `apps/web`-only per this repo's convention).
- **Ordering decision flagged for reviewer:** `requireModuleInDesktop` is placed **before** `authMiddleware`/`rlsMiddleware` in every factory (not after) — deliberate, because license/module gating is DB- and user-independent and should fail fast/cheap, and because it lets gating tests skip JWT/DB setup entirely. If a reviewer prefers gating *after* auth, only the middleware order in Tasks 2-12's Step 3 changes — the test assertions (403/`LICENSE_NOT_FOUND`) stay identical.
- **`staff` → `/api/users` mapping flagged as the one interpretive call** in this plan (spec §4, Task 7 note) — `MODULE_MAP` has no route group literally named "staff"; `/api/users` is the closest semantic fit and the permission-code mismatch (`user.*` used, `staff.*` unused catalog entries) is called out explicitly rather than silently assumed.
- **Coverage completeness:** all 11 `MODULE_MAP` keys are wired across Tasks 2-12; Task 13 proves both halves of the scope boundary (mode: cloud/CI unaffected; route: non-`MODULE_MAP` groups unaffected).
