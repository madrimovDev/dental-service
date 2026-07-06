# CLI-359 — uploads.ts mount + tenant-scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /uploads/:key` route'ni (`apps/api/src/routes/uploads.ts`) `apps/api/src/app.ts`ga mount qilish (hozir hech qayerda ulanmagan — bemor rasmlari URL'lari 404 beradi) VA shu bilan bir vaqtda cross-tenant fayl kirishni bloklaydigan tenant-scoping tekshiruvini qo'shish (mount qilingan zahoti RLS qamrovidan tashqaridagi bu filesystem route IDOR bo'lib qoladi, agar tekshiruv bo'lmasa).

**Architecture:** `uploads.ts` allaqachon `authMiddleware()` bilan himoyalangan `Hono` sub-app (`uploadsRoutes(storage: StorageAdapter)`, key format `tenants/{tenantId}/patients/{patientId}/{imageId}.{ext}` — yagona producer `patientImageKey()`, `apps/api/src/lib/s3.ts:16-24`). `app.ts` `createLocalStorageAdapter()`dan yangi instansiya yaratib `/uploads` prefiksida mount qiladi (`WEB_DIST_DIR` catch-all'dan oldin). `uploads.ts` ichida `c.get('activeTenantId')` key'ning `tenants/{tenantId}` segmenti bilan solishtiriladi — mos kelmasa 404 (mavjud "file not found" javobi bilan bir xil shakl — enumeration oldini olish uchun 403 emas).

**Tech Stack:** Bun, Hono, `apps/api/src/routes/uploads.ts`, `apps/api/src/lib/storage.ts`, `apps/api/src/app.ts`, `bun:test` (integration).

## Global Constraints

- DB ustun/RLS o'zgarmaydi — bu ticket faqat HTTP route mount + in-memory string tekshiruv, migratsiya yo'q.
- Cross-tenant fayl kirish HAR QANDAY holatda bloklanishi shart (global xavfsizlik talabi) — mismatch bo'lsa har doim 404, hech qachon fayl bytelarini qaytarmaslik.
- `uploads.ts`ning mavjud path-traversal himoyasi (`storage.ts`ning `resolveSafePath`) va bir martalik `c.req.param('key')` decode xulqi o'zgarmaydi — ularga tegilmaydi.
- Tests: `cd apps/api && bun test --env-file=../../.env <fayl-nomi-substring>` (bun:test, NOT vitest). Integration testlar real `createApp()` + real JWT (`signAccess`) + real fayl (tmp-dir'dagi `createLocalStorageAdapter`) ishlatadi — mock yo'q.
- Rol-bo'yicha emas (bu route permission-gated emas, faqat auth+tenant) — lekin ikki HAQIQIY tenant (ikkita random UUID, DB seed shart emas — tekshiruv DB'ga bormaydi) bilan sinaladi, hech qachon bitta tenant bilan emas.
- Import tartib: mavjud `app.ts`dagi guruhlash saqlanadi (`./lib/*` alifbo tartibida, `./routes/*` alifbo tartibida).

---

### Task 1: `/uploads` route'ni `app.ts`ga mount qilish

**Files:**
- Modify: `apps/api/src/app.ts` (import qatorlari + route ro'yxati, ~7-40 va ~149-155 qatorlar)
- Create: `apps/api/tests/integration/cli-359-uploads-mount.test.ts`

**Interfaces:**
- Consumes: `uploadsRoutes(storage: StorageAdapter)` (`apps/api/src/routes/uploads.ts:22`), `createLocalStorageAdapter()` (`apps/api/src/lib/storage.ts:40`).
- Produces: `GET /uploads/:key` HTTP endpoint (auth-required) real `createApp()` orqali erishiladigan.

- [ ] **Step 1: Write the failing test**

`apps/api/tests/integration/cli-359-uploads-mount.test.ts`:

```ts
/**
 * CLI-359 — `GET /uploads/:key` mount + tenant-scoping (REAL DB emas —
 * bu route filesystem-based, DB'ga bormaydi; ikkita tenantId — random UUID,
 * seed shart emas).
 *
 * `UPLOADS_DIR` — `app.ts` va `lib/s3.ts` modul-darajasida `createLocalStorageAdapter()`
 * yaratadi, `process.env.UPLOADS_DIR`ni MODUL YUKLANGANDA o'qiydi — shuning uchun
 * bu env `../../src/app.ts` dynamic import'idan OLDIN o'rnatiladi (activate.test.ts
 * bilan bir xil idiom: mock/env import'dan oldin).
 *
 * Ishga tushirish: `cd apps/api && bun test --env-file=../../.env cli-359-uploads-mount`
 */

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';

const testUploadsDir = await mkdtemp(join(tmpdir(), 'cli-359-uploads-'));
process.env.UPLOADS_DIR = testUploadsDir;

const { createApp } = await import('../../src/app.ts');
const { createLocalStorageAdapter } = await import('../../src/lib/storage.ts');
const { signAccess } = await import('../../src/lib/jwt.ts');

afterAll(async () => {
  await rm(testUploadsDir, { recursive: true, force: true });
});

describe('CLI-359 — /uploads mount', () => {
  test('GET /uploads/:key without Authorization -> 401 (proves route is mounted)', async () => {
    const app = createApp();
    // Mount qilinmagan bo'lsa Hono default 404 "Not Found" qaytaradi (route
    // yo'q); mount qilingandan keyin authMiddleware 401 bilan bloklaydi —
    // shu farq mount qilinganini isbotlaydi.
    const res = await app.request('/uploads/tenants/x/patients/y/z.jpg');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test --env-file=../../.env cli-359-uploads-mount`
Expected: FAIL — `res.status` `404` (Hono default "not found", route mount qilinmagan), `401` emas.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/app.ts` — import qatoriga qo'shish (mavjud `./lib/env.ts` importidan keyin, alifbo tartibi saqlanadi):

```ts
import { env } from './lib/env.ts';
import { METRICS_CONTENT_TYPE, renderMetrics } from './lib/metrics.ts';
import { createLocalStorageAdapter } from './lib/storage.ts';
```

Va `import { activateRoutes } from './routes/activate.ts';` qatoridan keyin:

```ts
import { activateRoutes } from './routes/activate.ts';
import { uploadsRoutes } from './routes/uploads.ts';
```

Route ro'yxatiga — `app.route('/api/notifications', notificationsRoutes({ db, sms }));` qatoridan keyin, `WEB_DIST_DIR` catch-all blokidan OLDIN (`apps/api/src/app.ts:154-156` atrofi):

```ts
  app.route('/api/notifications', notificationsRoutes({ db, sms }));
  // CLI-359: bemor rasmlari (`patient-images`) `serveUrl()` orqali generatsiya
  // qilingan `/uploads/:key` URL'lar shu route orqali serve qilinadi (local
  // filesystem storage — MinIO/S3 emas, CLI-340). Tenant-scoping tekshiruvi
  // `uploads.ts` ichida (key'dagi tenantId JWT `activeTenantId` bilan
  // solishtiriladi — bu route filesystem-based, RLS qamrovidan tashqarida).
  const uploadsStorage = createLocalStorageAdapter();
  app.route('/uploads', uploadsRoutes(uploadsStorage));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test --env-file=../../.env cli-359-uploads-mount`
Expected: PASS (1/1). `401` — auth middleware endi ishlamoqda, route mavjud.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app.ts apps/api/tests/integration/cli-359-uploads-mount.test.ts
git commit -m "fix(api): mount GET /uploads/:key route in app.ts (CLI-359)"
```

---

### Task 2: Tenant-scoping tekshiruvi — cross-tenant kirish bloklash

**Files:**
- Modify: `apps/api/src/routes/uploads.ts:27-41`
- Modify: `apps/api/tests/integration/cli-359-uploads-mount.test.ts` (yangi testlar qo'shiladi)

**Interfaces:**
- Consumes: `c.get('activeTenantId')` (`ContextVariableMap.activeTenantId?: string | null`, `apps/api/src/lib/audit-logger.ts:18`; `authMiddleware()` `apps/api/src/middleware/auth.ts:42` orqali `c.set` qiladi).
- Produces: `GET /uploads/:key` — key'ning `tenants/{tenantId}` segmenti `activeTenantId`ga mos kelmasa `404 { success:false, error:{code:'NOT_FOUND', ...} }`.

- [ ] **Step 1: Write the failing test**

Yuqoridagi test faylidagi `describe` blokiga qo'shish (mavjud testdan keyin):

```ts
  test('own-tenant JWT -> 200, file bytes match', async () => {
    const storage = createLocalStorageAdapter(testUploadsDir);
    const tenantAId = randomUUID();
    const patientId = randomUUID();
    const imageId = randomUUID();
    const key = `tenants/${tenantAId}/patients/${patientId}/${imageId}.jpg`;
    const fileBytes = Buffer.from('fake-jpeg-bytes');
    await storage.save(key, fileBytes);

    const { token } = await signAccess({
      sub: randomUUID(),
      atid: tenantAId,
      abid: null,
      perms: [],
      roleKey: null,
      lang: 'uz',
    });

    const app = createApp();
    const res = await app.request(`/uploads/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(fileBytes)).toBe(true);
  });

  test('cross-tenant JWT -> 404 (file exists but belongs to another tenant)', async () => {
    const storage = createLocalStorageAdapter(testUploadsDir);
    const tenantAId = randomUUID();
    const tenantBId = randomUUID();
    const patientId = randomUUID();
    const imageId = randomUUID();
    const key = `tenants/${tenantAId}/patients/${patientId}/${imageId}.jpg`;
    await storage.save(key, Buffer.from('fake-jpeg-bytes'));

    const { token } = await signAccess({
      sub: randomUUID(),
      atid: tenantBId, // boshqa tenant — key tenantAId'ga tegishli
      abid: null,
      perms: [],
      roleKey: null,
      lang: 'uz',
    });

    const app = createApp();
    const res = await app.request(`/uploads/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test --env-file=../../.env cli-359-uploads-mount`
Expected: `own-tenant` testi PASS (mavjud xulq bilan mos), lekin `cross-tenant` testi FAIL — hozirgi `uploads.ts` tenant tekshiruvisiz fayl mavjud bo'lsa har doim 200 qaytaradi (`res.status` `404` emas `200` bo'ladi) — bu aynan IDOR bug'ning isboti.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/routes/uploads.ts` — `app.get('/:key{.+}', ...)` handler'ni almashtirish:

```ts
  app.get('/:key{.+}', async (c) => {
    const key = c.req.param('key');
    const activeTenantId = c.get('activeTenantId');

    // Tenant-scoping (CLI-359): key formati doim `tenants/{tenantId}/...`
    // (yagona producer — `patientImageKey()`, lib/s3.ts). Bu route filesystem
    // asosida ishlaydi (RLS qamrovidan tashqarida), shuning uchun tenant
    // mosligini bu yerda qo'lda tekshiramiz. Mismatch bo'lsa 404 (403 emas) —
    // "file not found" bilan bir xil javob, fayl mavjudligini boshqa
    // tenantga oshkor qilmaslik uchun (enumeration'dan himoya).
    const [prefix, keyTenantId] = key.split('/');
    if (prefix !== 'tenants' || !keyTenantId || keyTenantId !== activeTenantId) {
      return c.json(fail('NOT_FOUND', 'File not found'), 404);
    }

    if (!(await storage.exists(key))) {
      return c.json(fail('NOT_FOUND', 'File not found'), 404);
    }

    // Bun.file(...).type extension asosida aniqlanadi (fayl mavjudligidan
    // qat'i nazar) — storage adapter'ning `baseDir`ini bu yerga chiqarmasdan
    // to'g'ri Content-Type olish uchun.
    const contentType = Bun.file(key).type || 'application/octet-stream';
    return new Response(storage.stream(key), {
      headers: { 'Content-Type': contentType },
    });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test --env-file=../../.env cli-359-uploads-mount`
Expected: PASS (3/3 — mount test + own-tenant + cross-tenant).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/uploads.ts apps/api/tests/integration/cli-359-uploads-mount.test.ts
git commit -m "fix(api): block cross-tenant file access in GET /uploads/:key (CLI-359)"
```

---

### Task 3: Edge-case qamrovi + to'liq typecheck/test yashil holatini tasdiqlash

**Files:**
- Modify: `apps/api/tests/integration/cli-359-uploads-mount.test.ts` (qo'shimcha testlar)

**Interfaces:**
- Consumes: Task 1-2'da yozilgan implementatsiya (o'zgarishsiz).
- Produces: to'liq test qamrovi (malformed key, mavjud bo'lmagan fayl + to'g'ri tenant kombinatsiyasi).

- [ ] **Step 1: Write the failing test (defensiv holatlar — kutilgan xulqni tasdiqlash, regressiya emas)**

Mavjud `describe` blokiga qo'shish:

```ts
  test('correct tenant but non-existent file -> 404 (unchanged from before CLI-359)', async () => {
    const tenantAId = randomUUID();
    const patientId = randomUUID();
    const key = `tenants/${tenantAId}/patients/${patientId}/${randomUUID()}.jpg`; // hech qachon save qilinmagan

    const { token } = await signAccess({
      sub: randomUUID(),
      atid: tenantAId,
      abid: null,
      perms: [],
      roleKey: null,
      lang: 'uz',
    });

    const app = createApp();
    const res = await app.request(`/uploads/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });

  test('malformed key (no "tenants/" prefix) -> 404, never leaks arbitrary path', async () => {
    const { token } = await signAccess({
      sub: randomUUID(),
      atid: randomUUID(),
      abid: null,
      perms: [],
      roleKey: null,
      lang: 'uz',
    });

    const app = createApp();
    const res = await app.request(`/uploads/${encodeURIComponent('not-a-tenant-path/x.jpg')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });
```

- [ ] **Step 2: Run test to verify it fails (yoki allaqachon o'tishini tasdiqlash)**

Run: `cd apps/api && bun test --env-file=../../.env cli-359-uploads-mount`
Expected: Task 1-2 implementatsiyasi bilan bu ikkala test allaqachon PASS bo'lishi kerak (Task 2'dagi `prefix !== 'tenants'` sharti buni allaqachon qamrab oladi) — agar FAIL bo'lsa, Task 2 implementatsiyasida gap bor, orqaga qaytib tuzatiladi.

- [ ] **Step 3: Minimal implementation (agar kerak bo'lsa)**

Kutilganidek — qo'shimcha kod o'zgarishi SHART EMAS (Task 2'dagi tekshiruv bu holatlarni allaqachon qamraydi). Agar Step 2 FAIL bersa, buning sababi noaniq edge-case (masalan `key.split('/')` bo'sh string bilan) — shu holatda `uploads.ts`dagi shartni kengaytirish kerak bo'ladi.

- [ ] **Step 4: Run full suite + typecheck**

Run: `cd apps/api && bun test --env-file=../../.env cli-359-uploads-mount`
Expected: PASS (5/5).

Run: `bun --filter @dental/api typecheck`
Expected: 0 xato.

- [ ] **Step 5: Commit**

```bash
git add apps/api/tests/integration/cli-359-uploads-mount.test.ts
git commit -m "test(api): edge-case coverage for /uploads tenant-scoping (CLI-359)"
```

---

## Self-review (placeholder va tip izchilligi tekshiruvi)

- Barcha kod bloklari **haqiqiy, ishlaydigan kod** — `TODO`/`<...>`/o'ylab topilgan
  API yo'q. `uploadsRoutes(storage)` signature (positional param) — ticket
  matnidagi `uploadsRoutes({ storage })` (object) EMAS — haqiqiy manba
  (`apps/api/src/routes/uploads.ts:22`) asosida yozilgan.
- `signAccess()` chaqiruvlari `AccessClaims` to'liq maydon to'plami bilan
  (`sub, atid, abid, perms, roleKey, lang` — `apps/api/src/lib/jwt.ts:19-27,57-64`),
  hech qanday maydon o'tkazib yuborilmagan.
- `c.get('activeTenantId')` tipi `string | null | undefined`
  (`ContextVariableMap`, `audit-logger.ts:18`) — `uploads.ts`dagi
  `keyTenantId !== activeTenantId` solishtiruvi `null`/`undefined` holatlarni
  ham xavfsiz qamraydi (hech qachon `true == null` bo'lmaydi, TS narrow qilish
  shart emas — string tenglik solishtiruvi).
- `process.env.UPLOADS_DIR` dynamic `await import('../../src/app.ts')`dan
  OLDIN o'rnatiladi — bu `s3.ts`/`app.ts`dagi modul-darajasidagi
  `createLocalStorageAdapter()` chaqiruvlari test tmp-dir'ini o'qishini
  kafolatlaydi (activate.test.ts'dagi mock-before-import idiomasi bilan bir xil).
- Test fayl nomi (`cli-359-uploads-mount.test.ts`) va joylashuvi
  (`apps/api/tests/integration/`) mavjud konvensiyaga mos
  (`cli-157-workspace-branches.test.ts`, `cli-80-vertical-endpoint.test.ts`).
- 404 (403 emas) qarori spec hujjatida asoslangan — DoD "403/404" ikkalasini
  ham qabul qiladi, shuning uchun bu ziddiyat emas.
- Task 3 — real yangi implementatsiya kodi yo'q (faqat qo'shimcha test), bu
  qasddan: Task 2'dagi tekshiruv mantig'i allaqachon bu holatlarni qamraydi;
  Step 2/3 buni EXPLICIT tekshiradi (ko'r-ko'rona "Done" belgilamaslik — loyiha
  darsiga mos, CLAUDE.md'dagi "adversarial verify haqiqiy gap topadi" saboqi).
