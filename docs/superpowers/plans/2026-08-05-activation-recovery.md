# Aktivatsiya tiklanishi + telefon kanonikligi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klinika bir marta aktivatsiya qilingandan keyin lokal baza yo'qolsa yuzaga keladigan tiklab bo'lmaydigan qulflanishni yopish, va telefon kanonikligini butun kodbazada bir xil qilish.

**Architecture:** Supervisor'ga bitta "qayta o'rnatishga tayyorlash" amali qo'shiladi (yangi vaqtinchalik parol + fingerprint tozalash). `apps/api` yangi public `bootstrap-status` endpointi orqali "litsenziya bor, lekin tenant yo'q" holatini oshkor qiladi; web va desktop shu signalga qarab foydalanuvchini to'g'ri ekranga yo'naltiradi. Yoniga uchta mustaqil tuzatish: idempotent skip'da login telefoni, `normalizePhone` divergent nusxasi, bemor telefoni kanonikligi.

**Tech Stack:** Bun + Hono + Drizzle (api, supervisor-api) · React + Vite + Mantine + TanStack Query (web, supervisor-admin) · Electron (desktop) · testlar: `bun:test` (api/supervisor), `vitest` (web/admin)

**Spec:** `docs/superpowers/specs/2026-08-05-activation-recovery-design.md`
**Audit:** `AUDIT-2026-08-05-activation-login.md`

---

## Global Constraints

- **Test framework:** `apps/api` va `apps/supervisor-api` — `bun:test`. `apps/web` va `apps/supervisor-admin` — `vitest`. Aralashtirilmaydi.
- **API testlarini ishga tushirish:** `bun test --env-file=../../.env` (`apps/api` ichidan).
- **`mock.module` ISHLATILMAYDI aktivatsiya yo'lida** — u resolved-path bo'yicha GLOBAL va boshqa test fayllarining Supervisor mock'ini jim chetlab o'tadi. Mavjud parametr seam'laridan foydalaniladi: `deps.activate`, `deps.markProvisioned`, `deps.writeLicense`, `deps.supervisorPublicKeyPem` (`apps/api/src/routes/activate.ts:73-101`).
- **Rate-limit:** `/api/activate` CLI-370 Redis fixed-window ostida (5/soat). Takroriy suite yugurishlarida 429 — kod xatosi EMAS. Tozalash: `docker exec dental-redis redis-cli -a "$PASS" --scan --pattern 'rl:*' | xargs -r docker exec -i dental-redis redis-cli -a "$PASS" del`.
- **Yagona test DB** (localhost:5433, per-run izolyatsiyasiz, ko'p suite truncate qiladi) — **integration testlar SERIAL ishga tushiriladi**.
- **i18n:** har yangi UI matni `uz.json` va `ru.json` ikkalasiga ham qo'shiladi (CLAUDE.md §3.9). Hardcoded matn yo'q.
- **Supervisor `@dental/*` paketlariga bog'lanmaydi** (Qaror #36) — `normalizePhone` nusxasi o'z joyida qoladi.
- **Har task oxirida:** `bun run typecheck` toza + `bun run lint` (biome) toza.

---

## File Structure

| Fayl | Mas'uliyat | Amal |
|---|---|---|
| `apps/supervisor-api/src/modules/licenses/licenses.service.ts` | `prepareReinstall()` metodi | Modify |
| `apps/supervisor-api/src/modules/clinics/clinics.routes.ts` | `POST /:id/prepare-reinstall` route | Modify |
| `apps/supervisor-api/src/modules/licenses/licenses.reinstall.test.ts` | Service + route testlari | Create |
| `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx` | Tugma + tasdiq + kredensiallar kartasi | Modify |
| `apps/api/src/routes/bootstrap-status.ts` | `GET /api/bootstrap-status` | Create |
| `apps/api/src/routes/bootstrap-status.test.ts` | Endpoint testlari | Create |
| `apps/api/src/lib/license-middleware.ts` | WHITELIST kengaytirish | Modify |
| `apps/api/src/app.ts` | Route mount | Modify |
| `apps/api/src/routes/activate.ts` | M1 — skip'da `ownerPhone` | Modify |
| `apps/api/src/lib/telegram-bot-manager.ts` | H1 — nusxani o'chirish | Modify |
| `apps/web/src/features/auth/auth.api.ts` | `useBootstrapStatus()` hook | Modify |
| `apps/web/src/features/auth/pages/activate.page.tsx` | Ikki holatli sahifa | Modify |
| `apps/web/src/features/auth/pages/login.page.tsx` | Gate → `/activate` | Modify |
| `packages/i18n/src/{uz,ru}.json` | Yangi kalitlar | Modify |
| `apps/api/src/modules/patients/patients.service.ts` | Telefon normalizatsiyasi (yozish + qidiruv) | Modify |
| `apps/api/drizzle/0044_normalize_patient_phones.sql` | Mavjud qatorlar migratsiyasi | Create |
| `apps/desktop/src/license-status.ts` | `fetchBootstrapStatus()` + gate | Modify |

---

## Lane taqsimoti (Workflow orkestratsiyasi uchun)

| Lane | Tasklar | Fayl-lokalligi | Bog'liqlik |
|---|---|---|---|
| **L1** | Task 1, 2 | `apps/supervisor-api`, `apps/supervisor-admin` | Mustaqil |
| **L2** | Task 3, 4, 5 | `apps/api/src/routes`, `apps/web/src/features/auth` | Mustaqil |
| **L3** | Task 6, 7 | `apps/api/src/routes/activate.ts`, `apps/api/src/lib/telegram-bot-manager.ts` | Mustaqil |
| **L4** | Task 8, 9 | `apps/api/src/modules/patients` | Mustaqil |
| **L5** | Task 10 | `apps/desktop` | **L2 (Task 3) dan keyin** |

**Ijro modeli:**
- **Implement fazasi PARALLEL** (`isolation: 'worktree'`) — L1/L2/L3/L4 bir vaqtda. Implementerlar **integration test ISHLATMAYDI** — faqat unit test + `typecheck` + `lint` (yagona test DB'ni clobber qilmaslik uchun).
- **Verify fazasi SERIAL** — bitta test DB, har lane navbat bilan real DB testlaridan o'tadi.
- **L5 — L2 tugagach**, alohida.
- **L4 oxirida** — aktivatsiya zanjiridan mustaqil, E2E'ni bloklamaydi.

⚠️ Worktree bazasini tekshirish: har lane branch'i uchun `git merge-base main <branch>` — eskirgan bazadan boshlangan bo'lsa `git merge main` qilinsin (2026-07 roundlarining takrorlangan darsi).

---

## L1 — Supervisor: qayta o'rnatishga tayyorlash

### Task 1: `prepareReinstall` service metodi

**Files:**
- Modify: `apps/supervisor-api/src/modules/licenses/licenses.service.ts` (yangi metod, `provisioned` yonida)
- Test: `apps/supervisor-api/src/modules/licenses/licenses.reinstall.test.ts` (Create)

**Interfaces:**
- Consumes: mavjud `db`, `clinics`, `licenses`, `licenseEvents` schema; `generateTempPassword` (`clinics.routes.ts` dan eksport qilingan)
- Produces: `prepareReinstall(clinicId: string, adminId?: string): Promise<{ loginPhone: string; tempPassword: string }>` — `createLicenseService()` qaytaruvchi obyektiga qo'shiladi

- [ ] **Step 1: Failing test yozish**

`apps/supervisor-api/src/modules/licenses/licenses.reinstall.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { branches, clinics, licenseEvents, licenses } from '../../db/schema';
import { createLicenseService } from './licenses.service';

const service = createLicenseService();

let clinicId: string;
let licenseId: string;

beforeEach(async () => {
  await db.delete(licenseEvents);
  await db.delete(licenses);
  await db.delete(branches);
  await db.delete(clinics);

  const [clinic] = await db
    .insert(clinics)
    .values({
      name: 'Test Klinika',
      ownerFullName: 'Aliyev Vali',
      ownerPhone: '+998901234567',
      ownerTempPassword: null, // allaqachon provision qilingan
      defaultLanguage: 'uz',
    })
    .returning();
  clinicId = clinic!.id;

  const [branch] = await db
    .insert(branches)
    .values({ clinicId, name: 'Bosh filial' })
    .returning();

  const [lic] = await db
    .insert(licenses)
    .values({
      clinicId,
      branchId: branch!.id,
      licenseKey: 'AAAAA-BBBBB-CCCCC-DDDDD',
      plan: 'premium',
      modules: ['patients'],
      gracePeriodDays: 30,
      expiresAt: new Date('2027-12-31'),
      isActive: true,
      fingerprint: 'eski-mashina-fp',
      provisionedAt: new Date('2026-08-01'),
    })
    .returning();
  licenseId = lic!.id;
});

describe('prepareReinstall', () => {
  test('yangi vaqtinchalik parol yozadi va fingerprint tozalaydi', async () => {
    const result = await service.prepareReinstall(clinicId, 'admin-1');

    expect(result.loginPhone).toBe('+998901234567');
    expect(result.tempPassword).toHaveLength(16);

    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
    expect(clinic!.ownerTempPassword).toBe(result.tempPassword);

    const lic = await db.query.licenses.findFirst({ where: eq(licenses.id, licenseId) });
    expect(lic!.fingerprint).toBeNull();
  });

  test('provisionedAt ga TEGMAYDI (D5 regressiya qulfi)', async () => {
    // provisionedAt NULL qilinsa heartbeat clearTempPassword chaqirib parolni
    // mijoz aktivatsiya qilishga ulgurmasdan o'chiradi (licenses.service.ts:178).
    await service.prepareReinstall(clinicId, 'admin-1');

    const lic = await db.query.licenses.findFirst({ where: eq(licenses.id, licenseId) });
    expect(lic!.provisionedAt).not.toBeNull();
    expect(lic!.provisionedAt!.toISOString()).toBe(new Date('2026-08-01').toISOString());
  });

  test('audit event yozadi', async () => {
    await service.prepareReinstall(clinicId, 'admin-1');

    const events = await db
      .select()
      .from(licenseEvents)
      .where(eq(licenseEvents.licenseId, licenseId));
    const ev = events.find((e) => e.event === 'prepare_reinstall');
    expect(ev).toBeDefined();
    expect(ev!.metadata).toMatchObject({ createdBy: 'admin-1' });
  });

  test("ownerPhone bo'sh bo'lsa rad etadi (D7)", async () => {
    await db.update(clinics).set({ ownerPhone: '' }).where(eq(clinics.id, clinicId));

    await expect(service.prepareReinstall(clinicId, 'admin-1')).rejects.toThrow(
      'OWNER_PHONE_MISSING',
    );
  });

  test('klinika topilmasa rad etadi', async () => {
    await expect(
      service.prepareReinstall('00000000-0000-0000-0000-000000000000', 'admin-1'),
    ).rejects.toThrow('CLINIC_NOT_FOUND');
  });

  test('litsenziya topilmasa rad etadi', async () => {
    await db.delete(licenses).where(eq(licenses.id, licenseId));

    await expect(service.prepareReinstall(clinicId, 'admin-1')).rejects.toThrow(
      'LICENSE_NOT_FOUND',
    );
  });
});
```

- [ ] **Step 2: Testni ishga tushirish — yiqilishini tasdiqlash**

Run: `cd apps/supervisor-api && bun test src/modules/licenses/licenses.reinstall.test.ts`
Expected: FAIL — `service.prepareReinstall is not a function`

- [ ] **Step 3: `generateTempPassword` ni qayta ishlatiladigan qilish**

`clinics.routes.ts` da u allaqachon `export const` — o'zgartirish shart emas, faqat import qilinadi.

`licenses.service.ts` yuqorisiga:

```ts
import { generateTempPassword } from '../clinics/clinics.routes';
```

⚠️ Agar bu aylanma import (circular) bersa — `generateTempPassword`ni yangi
`apps/supervisor-api/src/lib/temp-password.ts` fayliga ko'chiring va ikkala joyda
o'sha yerdan import qiling. Tekshirish: `bun test src/modules/clinics/clinics.test.ts`
hali ham yashil bo'lsin.

- [ ] **Step 4: Minimal implementatsiya**

`licenses.service.ts` — `provisioned` metodidan keyin qo'shiladi:

```ts
  /**
   * Vendor amali: klinikani QAYTA O'RNATISHGA tayyorlaydi (audit C1).
   *
   * Ikki ish BIRGA bajariladi — alohida tugmalarda noto'g'ri tartib
   * (avval `reactivate`) aktivatsiyani "muvaffaqiyatli" ko'rsatib, provisioning
   * bloki yo'qligi sababli jim qulflanishni QAYTARARDI:
   *  1. yangi vaqtinchalik parol → `buildProvisioning` yana blok qaytaradi;
   *  2. `fingerprint = NULL` → keyingi `/activate` ISTALGAN mashinaga bog'lanadi
   *     (yangi kompyuter yoki o'sha mashinada tozalangan baza — bir xil yo'l).
   *
   * 🔴 `provisionedAt` ATAYIN O'ZGARTIRILMAYDI. `buildProvisioning` faqat
   * `ownerTempPassword && ownerPhone`ga qaraydi — `provisionedAt`ga EMAS.
   * Agar u NULL qilinsa, `heartbeat`dagi `if (!lic.provisionedAt)` sharti
   * ochilib, birinchi heartbeat (boot'da + har 4 soat) parolni mijoz
   * aktivatsiya qilishga ULGURMASDAN o'chirib yuboradi. Buni
   * "soddalashtirib" NULL qilmang.
   */
  async prepareReinstall(clinicId: string, adminId?: string) {
    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
    if (!clinic) throw Object.assign(new Error('CLINIC_NOT_FOUND'), { status: 404 });
    // Provisioning bloki `ownerPhone`siz qurilmaydi (buildProvisioning) —
    // parol yozib qo'yish behuda bo'lardi. Migratsiya eski qatorlarni bo'sh
    // satr bilan to'ldirgan.
    if (!clinic.ownerPhone) {
      throw Object.assign(new Error('OWNER_PHONE_MISSING'), { status: 400 });
    }

    const lic = await db.query.licenses.findFirst({ where: eq(licenses.clinicId, clinicId) });
    if (!lic) throw Object.assign(new Error('LICENSE_NOT_FOUND'), { status: 404 });

    const tempPassword = generateTempPassword();

    await db.transaction(async (tx) => {
      await tx
        .update(clinics)
        .set({ ownerTempPassword: tempPassword })
        .where(eq(clinics.id, clinicId));
      await tx
        .update(licenses)
        .set({ fingerprint: null })
        .where(eq(licenses.id, lic.id));
      await tx.insert(licenseEvents).values({
        licenseId: lic.id,
        event: 'prepare_reinstall',
        metadata: { createdBy: adminId ?? null, previousFingerprint: lic.fingerprint },
      });
    });

    return { loginPhone: clinic.ownerPhone, tempPassword };
  },
```

- [ ] **Step 5: Testni ishga tushirish — o'tishini tasdiqlash**

Run: `cd apps/supervisor-api && bun test src/modules/licenses/licenses.reinstall.test.ts`
Expected: 6 PASS

- [ ] **Step 6: Regressiya — mavjud litsenziya testlari**

Run: `cd apps/supervisor-api && bun test src/modules/licenses/`
Expected: hammasi PASS (`licenses.test.ts`, `licenses.reset.test.ts` ham)

- [ ] **Step 7: Typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: toza

- [ ] **Step 8: Commit**

```bash
git add apps/supervisor-api/src/modules/licenses/
git commit -m "feat(supervisor): qayta o'rnatishga tayyorlash — yangi vaqtinchalik parol + fingerprint tozalash"
```

---

### Task 2: `POST /:id/prepare-reinstall` route + admin panel tugmasi

**Files:**
- Modify: `apps/supervisor-api/src/modules/clinics/clinics.routes.ts` (`deactivate` route yonida)
- Modify: `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx`
- Test: `apps/supervisor-api/src/modules/clinics/clinics.routes.test.ts` (mavjud faylga qo'shiladi)
- Test: `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.test.tsx` (mavjud faylga qo'shiladi)

**Interfaces:**
- Consumes: Task 1 ning `prepareReinstall(clinicId, adminId)` metodi
- Produces: `POST /v1/admin/clinics/:id/prepare-reinstall` → `200 { credentials: { loginPhone, tempPassword } }` · `400 { error: { code: 'OWNER_PHONE_MISSING' } }` · `404 { error: { code: 'CLINIC_NOT_FOUND' | 'LICENSE_NOT_FOUND' } }`

- [ ] **Step 1: Failing route testi**

`clinics.routes.test.ts` fayliga qo'shiladi (mavjud `describe` bloklari yonida):

```ts
describe('POST /:id/prepare-reinstall', () => {
  test('kredensiallar qaytaradi', async () => {
    const res = await app.request(`/v1/admin/clinics/${clinicId}/prepare-reinstall`, {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credentials.loginPhone).toBe('+998901234567');
    expect(body.credentials.tempPassword).toHaveLength(16);
  });

  test('auth siz 401', async () => {
    const res = await app.request(`/v1/admin/clinics/${clinicId}/prepare-reinstall`, {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  test("noto'g'ri uuid → 404", async () => {
    const res = await app.request('/v1/admin/clinics/not-a-uuid/prepare-reinstall', {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(404);
  });
});
```

⚠️ `app`, `adminToken`, `clinicId` — mavjud test faylining setup'idan keladi. Agar u
boshqacha nomlangan bo'lsa, faylning mavjud konvensiyasiga moslang (yangi setup yozmang).

- [ ] **Step 2: Testni ishga tushirish — yiqilishini tasdiqlash**

Run: `cd apps/supervisor-api && bun test src/modules/clinics/clinics.routes.test.ts`
Expected: FAIL — 404 (route yo'q)

- [ ] **Step 3: Route qo'shish**

`clinics.routes.ts` — `deactivate` route'idan keyin:

```ts
  // Qayta o'rnatishga tayyorlash (audit C1) — mijoz mashinasi almashsa yoki
  // lokal baza yo'qolsa. Yangi vaqtinchalik parol + fingerprint tozalash BIRGA
  // (licenses.service.ts `prepareReinstall` izohiga qarang).
  app.post('/:id/prepare-reinstall', async (c) => {
    const idResult = uuidSchema.safeParse(c.req.param('id'));
    if (!idResult.success) return c.json({ error: { code: 'NOT_FOUND' } }, 404);

    const adminId = c.get('adminId') as string | undefined;
    try {
      const credentials = await service.prepareReinstall(idResult.data, adminId);
      return c.json({ credentials });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'UNKNOWN';
      const status = (err as { status?: number }).status ?? 500;
      return c.json({ error: { code } }, status as 400 | 404 | 500);
    }
  });
```

⚠️ `service` — `clinicsRoutes()` ichida `createLicenseService()` bilan quriladi. Agar
fayl hozir service ishlatmasa, yuqorida bir marta qo'shing:
`const service = createLicenseService();` + `import { createLicenseService } from '../licenses/licenses.service';`

⚠️ `c.get('adminId')` — `adminJwtMiddleware` qanday nom bilan yozishini tekshiring
(`jwt.middleware.ts`). Boshqacha bo'lsa o'shanga moslang; yo'q bo'lsa `undefined`
qoldiring (audit `createdBy: null` bo'ladi, test shunga moslanadi).

- [ ] **Step 4: Testni ishga tushirish — o'tishini tasdiqlash**

Run: `cd apps/supervisor-api && bun test src/modules/clinics/`
Expected: hammasi PASS

- [ ] **Step 5: Admin panel — failing test**

`ClinicDetailPage.test.tsx` fayliga qo'shiladi:

```tsx
test("qayta o'rnatishga tayyorlash tugmasi kredensiallarni ko'rsatadi", async () => {
  const user = userEvent.setup();
  server.use(
    http.post('*/prepare-reinstall', () =>
      HttpResponse.json({
        credentials: { loginPhone: '+998901234567', tempPassword: 'AbCdEfGhJkLmNpQr' },
      }),
    ),
  );

  renderWithProviders(<ClinicDetailPage />);

  await user.click(await screen.findByRole('button', { name: /tayyorlash/i }));
  await user.click(await screen.findByRole('button', { name: /tasdiqlash/i }));

  expect(await screen.findByText('AbCdEfGhJkLmNpQr')).toBeInTheDocument();
  expect(await screen.findByText('+998901234567')).toBeInTheDocument();
});
```

⚠️ `server`/`renderWithProviders`/`http` — mavjud test faylining setup'idan. Agar u
MSW ishlatmasa (masalan `authFetch` mock qilingan bo'lsa), o'sha konvensiyaga moslang.

- [ ] **Step 6: Testni ishga tushirish — yiqilishini tasdiqlash**

Run: `cd apps/supervisor-admin && bun run test -- ClinicDetailPage`
Expected: FAIL — tugma topilmadi

- [ ] **Step 7: Tugma + tasdiq + kredensiallar kartasi**

`ClinicDetailPage.tsx` — mavjud `generateResetToken` mutatsiyasi PATTERNINI takrorlab:

```tsx
  const [reinstallCreds, setReinstallCreds] = useState<{
    loginPhone: string;
    tempPassword: string;
  } | null>(null);
  const [reinstallConfirm, setReinstallConfirm] = useState(false);

  const prepareReinstall = useMutation({
    mutationFn: async () => {
      const res = await authFetch(`/v1/admin/clinics/${clinicId}/prepare-reinstall`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error((await res.json()).error?.code ?? 'XATO');
      return res.json() as Promise<{
        credentials: { loginPhone: string; tempPassword: string };
      }>;
    },
    onSuccess: (result) => {
      setReinstallCreds(result.credentials);
      setReinstallConfirm(false);
    },
    onError: (e: Error) => setMutationError(e.message),
  });
```

Tugma (mavjud tugmalar Group'iga):

```tsx
          <Button size="xs" variant="outline" onClick={() => setReinstallConfirm(true)}>
            Qayta o'rnatishga tayyorlash
          </Button>
```

Tasdiq modali:

```tsx
      <Modal
        opened={reinstallConfirm}
        onClose={() => setReinstallConfirm(false)}
        title="Qayta o'rnatishga tayyorlash"
      >
        <Text size="sm" mb="md">
          Yangi vaqtinchalik parol yaratiladi va qurilma bog'lanishi (fingerprint)
          bekor qilinadi. Mijoz istalgan kompyuterda litsenziya kalitini kiritib
          klinikani qaytadan o'rnata oladi. Eski parol ishlamay qoladi.
        </Text>
        <Button onClick={() => prepareReinstall.mutate()} loading={prepareReinstall.isPending}>
          Tasdiqlash
        </Button>
      </Modal>
```

Kredensiallar kartasi (mavjud `resetToken` kartasi uslubida, `CopyButton` bilan):

```tsx
      {reinstallCreds && (
        <Paper withBorder p="md" mt="md">
          <Text fw={600} mb="xs">
            Mijozga yetkazing (bir marta ko'rsatiladi)
          </Text>
          <Text size="sm">Login (telefon): {reinstallCreds.loginPhone}</Text>
          <Text size="sm">Vaqtinchalik parol: {reinstallCreds.tempPassword}</Text>
          <CopyButton value={reinstallCreds.tempPassword}>
            {({ copied, copy }) => (
              <Button size="xs" variant="subtle" onClick={copy}>
                {copied ? 'Nusxalandi' : 'Parolni nusxalash'}
              </Button>
            )}
          </CopyButton>
        </Paper>
      )}
```

> ℹ️ `supervisor-admin` — vendor ichki paneli, i18n talab qilinmaydi (mavjud sahifalar
> ham o'zbekcha hardcoded). CLAUDE.md §3.9 mijoz UI'siga tegishli.

- [ ] **Step 8: Testni ishga tushirish — o'tishini tasdiqlash**

Run: `cd apps/supervisor-admin && bun run test -- ClinicDetailPage`
Expected: PASS

- [ ] **Step 9: Typecheck + lint + commit**

```bash
bun run typecheck && bun run lint
git add apps/supervisor-api/src/modules/clinics/ apps/supervisor-admin/src/features/clinics/
git commit -m "feat(supervisor): qayta o'rnatishga tayyorlash route + admin panel tugmasi"
```

---

## L2 — bootstrap-status + web gate

### Task 3: `GET /api/bootstrap-status` endpoint

**Files:**
- Create: `apps/api/src/routes/bootstrap-status.ts`
- Create: `apps/api/src/routes/bootstrap-status.test.ts`
- Modify: `apps/api/src/lib/license-middleware.ts:14` (WHITELIST)
- Modify: `apps/api/src/app.ts` (mount, `/api/activate` yonida)

**Interfaces:**
- Produces: `GET /api/bootstrap-status` → `200 { data: { hasLicense: boolean, hasTenant: boolean } }`. Web (Task 4) va desktop (Task 10) shu shakldan foydalanadi.

- [ ] **Step 1: Failing test**

`apps/api/src/routes/bootstrap-status.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { bootstrapStatusRoutes } from './bootstrap-status.ts';

const fakeDb = (hasTenant: boolean) =>
  ({
    select: () => ({
      from: () => ({
        limit: async () => (hasTenant ? [{ id: 'tenant-1' }] : []),
      }),
    }),
  }) as never;

describe('GET /api/bootstrap-status', () => {
  test('tenant bor + litsenziya bor', async () => {
    const app = bootstrapStatusRoutes({
      db: fakeDb(true),
      readLicense: async () => ({ licenseKey: 'X' }) as never,
    });
    const res = await app.request('/');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { hasLicense: true, hasTenant: true } });
  });

  test("litsenziya bor, tenant YO'Q — qulflanish holati", async () => {
    const app = bootstrapStatusRoutes({
      db: fakeDb(false),
      readLicense: async () => ({ licenseKey: 'X' }) as never,
    });
    const res = await app.request('/');

    expect(await res.json()).toEqual({ data: { hasLicense: true, hasTenant: false } });
  });

  test("litsenziya yo'q", async () => {
    const app = bootstrapStatusRoutes({
      db: fakeDb(false),
      readLicense: async () => null,
    });
    const res = await app.request('/');

    expect(await res.json()).toEqual({ data: { hasLicense: false, hasTenant: false } });
  });

  test('DB xatosi 500 beradi (gate bloklamaydi — web fallback qiladi)', async () => {
    const app = bootstrapStatusRoutes({
      db: {
        select: () => ({
          from: () => ({
            limit: async () => {
              throw new Error('connection refused');
            },
          }),
        }),
      } as never,
      readLicense: async () => null,
    });
    const res = await app.request('/');

    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Testni ishga tushirish — yiqilishini tasdiqlash**

Run: `cd apps/api && bun test src/routes/bootstrap-status.test.ts --env-file=../../.env`
Expected: FAIL — modul topilmadi

- [ ] **Step 3: Endpoint implementatsiyasi**

`apps/api/src/routes/bootstrap-status.ts`:

🔴 **`OpenAPIHono` + `createRoute` bilan yoziladi, oddiy `Hono` bilan EMAS.** Sabab:
web (Task 4) bu endpointni **generated api-client** orqali chaqiradi (CLAUDE.md §3.6 —
`fetch()` to'g'ridan-to'g'ri taqiqlangan), shuning uchun u OpenAPI spec'ga tushishi
shart. `activate.ts` oddiy Hono, chunki uni faqat `/activate` sahifasi raw chaqiradi;
bu endpoint esa umumiy hook orqali ishlatiladi. Namuna: `auth.routes.ts:151`
(`registrationEnabledRoute`).

```ts
import { ok } from '@dental/core';
import { tenants } from '@dental/db-schema';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../db/client.ts';
import { readLicense as defaultReadLicense } from '../lib/license.ts';
import { apiResponseSchema } from '../lib/openapi.ts';

export const bootstrapStatusResponseSchema = z
  .object({ hasLicense: z.boolean(), hasTenant: z.boolean() })
  .openapi('BootstrapStatusResponse');

/**
 * `GET /api/bootstrap-status` — ilova ishlashga TAYYORMI (audit C1).
 *
 * Auth YO'Q, permission YO'Q: login sahifasidan OLDIN chaqiriladi
 * (`/registration-enabled` pretsedenti). `license-middleware.ts` WHITELIST'iga
 * ham qo'shilgan — aks holda `.lic` yo'q paytda `requireModule`
 * `LICENSE_NOT_FOUND` qaytarib, aynan aniqlamoqchi bo'lgan holatni yopib
 * qo'yardi.
 *
 * Nima uchun kerak: `.lic` bor, lekin lokal bazada tenant yo'q holat mavjud
 * (baza yo'qolgan / yangi kompyuter). Bunda desktop gate'i (fayl-mavjudligi)
 * asosiy UI'ni ochadi, login esa 401 beradi — foydalanuvchi sababni
 * bilmaydi. Bu endpoint ikkalasini ajratadi.
 *
 * `readLicense` injectable — test uchun (`.lic` faylsiz).
 */
export const bootstrapStatusRoutes = (deps: {
  db: Database;
  readLicense?: typeof defaultReadLicense;
}) => {
  const readLic = deps.readLicense ?? defaultReadLicense;
  const app = new OpenAPIHono();

  const route = createRoute({
    method: 'get',
    path: '/',
    tags: ['auth'],
    operationId: 'bootstrapStatus',
    responses: {
      200: {
        content: {
          'application/json': { schema: apiResponseSchema(bootstrapStatusResponseSchema) },
        },
        description: 'Whether the local install has a license and a provisioned tenant',
      },
    },
  });

  app.openapi(route, async (c) => {
    // `tenants` jadvalida RLS YO'Q (auth.service.ts:201 izohi) — pre-auth
    // kontekstda ham o'qish mumkin. Faqat MAVJUDLIK, hech qanday tafsilot
    // qaytarilmaydi (pre-auth surface).
    const rows = await deps.db.select({ id: tenants.id }).from(tenants).limit(1);
    const lic = await readLic();

    return c.json(ok({ hasLicense: lic !== null, hasTenant: rows.length > 0 }), 200);
  });

  return app;
};
```

⚠️ `apiResponseSchema` import yo'li mavjud modullardan nusxa olinadi
(`auth.routes.ts` qaysi yo'ldan import qilsa — o'sha).

- [ ] **Step 4: WHITELIST kengaytirish**

`apps/api/src/lib/license-middleware.ts:14`:

```ts
const WHITELIST = [
  '/activate',
  '/api/activate',
  '/api/reset-owner-password',
  // Pre-auth diagnostika (audit C1) — `.lic` yo'q holatni ANIQLASH uchun
  // ishlatiladi, shuning uchun uning o'zi litsenziya gate'i ostida bo'lmaydi.
  '/api/bootstrap-status',
];
```

- [ ] **Step 5: Mount**

`apps/api/src/app.ts` — `/api/activate` qatoridan keyin:

```ts
  app.route('/api/bootstrap-status', bootstrapStatusRoutes({ db }));
```

Import (fayl yuqorisida, `activateRoutes` yonida):

```ts
import { bootstrapStatusRoutes } from './routes/bootstrap-status.ts';
```

- [ ] **Step 6: Testni ishga tushirish**

Run: `cd apps/api && bun test src/routes/bootstrap-status.test.ts --env-file=../../.env`
Expected: 4 PASS

- [ ] **Step 7: WHITELIST regressiya testi**

`apps/api/src/lib/license-middleware.test.ts` fayliga qo'shiladi:

```ts
test("bootstrap-status litsenziyasiz ham ochiq (WHITELIST)", async () => {
  const app = new Hono();
  app.use('*', requireModule('patients'));
  app.get('/api/bootstrap-status', (c) => c.json({ ok: true }));

  const res = await app.request('/api/bootstrap-status');
  expect(res.status).toBe(200);
});
```

Run: `cd apps/api && bun test src/lib/license-middleware.test.ts --env-file=../../.env`
Expected: PASS

- [ ] **Step 8: OpenAPI spec + api-client regeneratsiyasi**

Run: `bun run generate:contract`

Tasdiqlang: `packages/api-client` barrel'ida `bootstrapStatus` funksiyasi paydo
bo'ldi (Task 4 uni import qiladi).

Run: `grep -rn "bootstrapStatus" packages/api-client/src/index.ts`
Expected: eksport qatori topiladi

⚠️ Bu qadam **majburiy** — o'tkazib yuborilsa Task 4 typecheck'da yiqiladi. Bu
2026-07-11 roundida "dormant feature" darsi: schema bor, lekin generated klient
bilmaydi → API'dan ishlatib bo'lmaydi.

- [ ] **Step 9: Typecheck + lint + commit**

```bash
bun run typecheck && bun run lint
git add apps/api/src/routes/bootstrap-status.ts apps/api/src/routes/bootstrap-status.test.ts apps/api/src/lib/license-middleware.ts apps/api/src/lib/license-middleware.test.ts apps/api/src/app.ts packages/api-client/
git commit -m "feat(api): bootstrap-status endpoint — litsenziya bor lekin tenant yo'q holatini oshkor qiladi"
```

---

### Task 4: Web — `/activate` sahifasining ikkinchi holati

**Files:**
- Modify: `apps/web/src/features/auth/auth.api.ts` (yangi hook)
- Modify: `apps/web/src/features/auth/auth.keys.ts` (query key)
- Modify: `apps/web/src/features/auth/pages/activate.page.tsx`
- Modify: `packages/i18n/src/uz.json`, `packages/i18n/src/ru.json`
- Test: `apps/web/src/features/auth/pages/activate.page.test.tsx`

**Interfaces:**
- Consumes: Task 3 ning `GET /api/bootstrap-status` → `{ data: { hasLicense, hasTenant } }`
- Produces: `useBootstrapStatus()` hook — Task 5 (login gate) ham ishlatadi

- [ ] **Step 1: Failing test**

`activate.page.test.tsx` fayliga qo'shiladi:

```tsx
test("litsenziya bor lekin tenant yo'q — vendorga murojaat matni, forma YO'Q", async () => {
  server.use(
    http.get('*/api/bootstrap-status', () =>
      HttpResponse.json({ data: { hasLicense: true, hasTenant: false } }),
    ),
  );

  renderWithProviders(<ActivatePage />);

  expect(await screen.findByText(/ta'minotchiga murojaat/i)).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test("litsenziya yo'q — oddiy aktivatsiya formasi ko'rinadi", async () => {
  server.use(
    http.get('*/api/bootstrap-status', () =>
      HttpResponse.json({ data: { hasLicense: false, hasTenant: false } }),
    ),
  );

  renderWithProviders(<ActivatePage />);

  expect(await screen.findByRole('textbox')).toBeInTheDocument();
});
```

⚠️ `server`/`renderWithProviders` — mavjud test faylining setup'idan. Mavjud testlar
`bootstrap-status`ni mock qilmaydi — ularga default handler kerak bo'lishi mumkin
(`{ hasLicense: false, hasTenant: false }`), aks holda ular ham yangi shoxga tushadi.
Mavjud testlarni yashil saqlash MAJBURIY.

- [ ] **Step 2: Testni ishga tushirish — yiqilishini tasdiqlash**

Run: `cd apps/web && bun run test -- activate.page`
Expected: FAIL — matn topilmadi

- [ ] **Step 3: i18n kalitlari**

`packages/i18n/src/uz.json` — `auth.activate` bloki ichiga:

```json
"needs_vendor_title": "Klinika ma'lumotlari topilmadi",
"needs_vendor_body": "Litsenziya faollashtirilgan, lekin klinika ma'lumotlari bu kompyuterda topilmadi. Ta'minotchiga murojaat qiling — u \"qayta o'rnatishga tayyorlash\"ni bajarib, sizga yangi login va vaqtinchalik parol beradi."
```

`packages/i18n/src/ru.json` — xuddi shu kalitlar:

```json
"needs_vendor_title": "Данные клиники не найдены",
"needs_vendor_body": "Лицензия активирована, но данные клиники на этом компьютере не найдены. Обратитесь к поставщику — он выполнит «подготовку к переустановке» и выдаст вам новый логин и временный пароль."
```

- [ ] **Step 4: Query key + hook**

`auth.keys.ts`:

```ts
  bootstrapStatus: () => ['auth', 'bootstrap-status'] as const,
```

`auth.api.ts` (`useRegistrationEnabled` yonida, o'sha pattern):

```ts
export const useBootstrapStatus = () =>
  useQuery({
    queryKey: authKeys.bootstrapStatus(),
    queryFn: () => bootstrapStatus().then((r) => r.data),
    // Qulflanish holati sahifa ochilganda bir marta aniqlanadi — keshdan
    // eskirgan javob bilan foydalanuvchini noto'g'ri ekranda ushlab qolmaslik
    // uchun har mount'da yangilanadi.
    staleTime: 0,
  });
```

`bootstrapStatus` — **generated** api-client funksiyasi (Task 3 endpointni
`OpenAPIHono` bilan yozgani uchun u OpenAPI spec'da bor). Barrel'dan import qilinadi,
`useRegistrationEnabled` qanday import qilsa — xuddi shunday.

Agar funksiya topilmasa: Task 3 ning Step 8 dagi `bun run generate:contract` qadami
bajarilmagan. Uni ishga tushiring, keyin `packages/api-client` barrel'ida
`bootstrapStatus` eksport qilinganini tasdiqlang.

- [ ] **Step 5: Sahifa ikki holatga bo'linadi**

`activate.page.tsx`:

```tsx
  const bootstrap = useBootstrapStatus();
  const needsVendor = bootstrap.data?.hasLicense === true && bootstrap.data?.hasTenant === false;
```

`return (` ichida, forma Paper'idan OLDIN:

```tsx
      {needsVendor ? (
        <Paper withBorder p="lg" radius="md">
          <Title order={3} mb="xs">
            {t('auth.activate.needs_vendor_title')}
          </Title>
          <Text size="sm">{t('auth.activate.needs_vendor_body')}</Text>
        </Paper>
      ) : (
        /* mavjud forma bloki — o'zgarishsiz */
      )}
```

- [ ] **Step 6: Testni ishga tushirish**

Run: `cd apps/web && bun run test -- activate.page`
Expected: hammasi PASS (yangi 2 + mavjudlar)

- [ ] **Step 7: Typecheck + lint + commit**

```bash
bun run typecheck && bun run lint
git add apps/web/src/features/auth/ packages/i18n/src/
git commit -m "feat(web): tenant yo'q holatida aktivatsiya sahifasi vendorga murojaat matnini ko'rsatadi"
```

---

### Task 5: Login sahifasi gate'i

**Files:**
- Modify: `apps/web/src/features/auth/pages/login.page.tsx`
- Test: `apps/web/src/features/auth/pages/login.page.test.tsx`

**Interfaces:**
- Consumes: Task 4 ning `useBootstrapStatus()` hooki

- [ ] **Step 1: Failing test**

```tsx
test("tenant yo'q bo'lsa /activate ga yo'naltiradi", async () => {
  server.use(
    http.get('*/api/bootstrap-status', () =>
      HttpResponse.json({ data: { hasLicense: true, hasTenant: false } }),
    ),
  );

  renderWithProviders(<LoginPage />);

  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/activate', { replace: true }));
});

test('tenant bor bo\'lsa login formasi ko\'rinadi', async () => {
  server.use(
    http.get('*/api/bootstrap-status', () =>
      HttpResponse.json({ data: { hasLicense: true, hasTenant: true } }),
    ),
  );

  renderWithProviders(<LoginPage />);

  expect(await screen.findByLabelText(/telefon/i)).toBeInTheDocument();
  expect(mockNavigate).not.toHaveBeenCalled();
});
```

⚠️ `mockNavigate` — mavjud test faylida `react-router` mock'i bormi tekshiring; yo'q
bo'lsa faylning mavjud navigatsiya-tekshirish uslubiga moslang.

- [ ] **Step 2: Testni ishga tushirish — yiqilishini tasdiqlash**

Run: `cd apps/web && bun run test -- login.page`
Expected: FAIL — navigate chaqirilmadi

- [ ] **Step 3: Gate qo'shish**

`login.page.tsx` — `useRegistrationEnabled()` yonida:

```tsx
  const bootstrap = useBootstrapStatus();
  const navigate = useNavigate();

  // Audit C1 — `.lic` bor, lekin lokal bazada tenant yo'q (baza yo'qolgan /
  // yangi kompyuter). Bunda login HAR DOIM 401 beradi va foydalanuvchi
  // sababni bilmaydi. `/activate` sahifasi holatni o'zi aniqlab "vendorga
  // murojaat" matnini ko'rsatadi (yangi route qo'shilmaydi).
  useEffect(() => {
    if (bootstrap.data?.hasTenant === false) {
      navigate('/activate', { replace: true });
    }
  }, [bootstrap.data?.hasTenant, navigate]);
```

- [ ] **Step 4: Testni ishga tushirish**

Run: `cd apps/web && bun run test -- login.page`
Expected: hammasi PASS

- [ ] **Step 5: Typecheck + lint + commit**

```bash
bun run typecheck && bun run lint
git add apps/web/src/features/auth/pages/login.page.tsx apps/web/src/features/auth/pages/login.page.test.tsx
git commit -m "feat(web): login sahifasi tenant yo'q holatida /activate ga yo'naltiradi"
```

---

## L3 — mayda tuzatishlar

### Task 6: M1 — idempotent skip'da login telefoni

**Files:**
- Modify: `apps/api/src/routes/activate.ts` (`applyProvisioning` + chaqiruv joyi)
- Test: `apps/api/tests/integration/provisioning-activate.test.ts`

**Interfaces:**
- Produces: `applyProvisioning` endi `Promise<{ applied: boolean; ownerPhone: string | null }>` qaytaradi (avval `Promise<boolean>`)

- [ ] **Step 1: Failing test**

`provisioning-activate.test.ts` fayliga qo'shiladi:

```ts
test("tenant allaqachon bor — javobda MAVJUD owner telefoni qaytadi (M1)", async () => {
  // Mavjud tenant + owner (vendor bergan telefondan FARQLI)
  await db.transaction((tx) =>
    provisionTenantInTx(tx, {
      tenantName: 'Mavjud klinika',
      ownerPhone: '+998911111111',
      ownerFullName: 'Mavjud Egasi',
      ownerPassword: 'parol-12-belgi',
      defaultLanguage: 'uz',
    }),
  );

  const app = createActivateApp(); // fayldagi mavjud helper
  const res = await app.request('/', {
    method: 'POST',
    body: JSON.stringify({ licenseKey: TEST_KEY }),
    headers: { 'content-type': 'application/json' },
  });

  expect(res.status).toBe(200);
  const body = await res.json();
  // Vendor bloki '+998901234567' beradi, lekin skip bo'lgani uchun MAVJUD
  // owner telefoni qaytadi — mijoz mavjud bo'lmagan hisobga urinmasin.
  expect(body.data.ownerPhone).toBe('+998911111111');
});
```

⚠️ `createActivateApp`/`TEST_KEY` — fayldagi mavjud setup nomlariga moslang. Supervisor
mock'i `deps.activate` parametri orqali beriladi (`mock.module` EMAS).

- [ ] **Step 2: Testni ishga tushirish — yiqilishini tasdiqlash**

Run: `cd apps/api && bun test tests/integration/provisioning-activate.test.ts --env-file=../../.env`
Expected: FAIL — `ownerPhone` `undefined`

- [ ] **Step 3: `applyProvisioning` qaytish tipini o'zgartirish**

`activate.ts`:

```ts
/**
 * @returns `applied` — provisioning qo'llandimi; `ownerPhone` — foydalanuvchiga
 * ko'rsatiladigan login telefoni (kanonik shakl).
 *
 * Skip holatida ham telefon qaytariladi, lekin MAVJUD owner'niki — vendor
 * bergan telefonni ko'rsatish mijozni mavjud bo'lmagan hisobga yo'llardi.
 * Yangi ma'lumot oshkor qilinmaydi: bu allaqachon shu mashinaning egasi.
 */
const applyProvisioning = async (
  db: Database,
  p: ProvisioningBlock,
): Promise<{ applied: boolean; ownerPhone: string | null }> => {
  const existing = await db
    .select({ id: tenants.id, ownerUserId: tenants.ownerUserId })
    .from(tenants)
    .limit(1);

  if (existing.length > 0) {
    logger.warn(
      { clinicId: p.clinicId, event: 'tenant.provisioning_skipped' },
      'tenant.provisioning_skipped — lokal bazada tenant mavjud, owner paroli qayta yozilmadi',
    );
    const [owner] = await db
      .select({ phone: users.phone })
      .from(users)
      .where(eq(users.id, existing[0]!.ownerUserId));
    return { applied: false, ownerPhone: owner?.phone ?? null };
  }

  await db.transaction((tx) =>
    provisionTenantInTx(tx, {
      tenantName: p.tenantName,
      ownerPhone: p.ownerPhone,
      ownerFullName: p.ownerFullName,
      ownerPassword: p.ownerPassword,
      defaultLanguage: p.defaultLanguage === 'ru' ? 'ru' : 'uz',
      branchName: p.branchName,
      branchAddress: p.branchAddress || null,
      branchPhone: p.branchPhone || null,
      auditAction: 'tenant.provisioned',
    }),
  );
  return { applied: true, ownerPhone: normalizePhone(p.ownerPhone) };
};
```

Import qo'shiladi: `users` (`@dental/db-schema`), `eq` (`drizzle-orm`).

Chaqiruv joyi (`activate.ts:191`):

```ts
        const result = await applyProvisioning(deps.db, provisioning);
        ownerPhone = result.ownerPhone ?? undefined;
```

- [ ] **Step 4: Testni ishga tushirish**

Run: `cd apps/api && bun test tests/integration/provisioning-activate.test.ts --env-file=../../.env`
Expected: hammasi PASS (yangi + mavjudlar)

- [ ] **Step 5: Typecheck + lint + commit**

```bash
bun run typecheck && bun run lint
git add apps/api/src/routes/activate.ts apps/api/tests/integration/provisioning-activate.test.ts
git commit -m "fix(api): idempotent skip'da mavjud owner telefoni qaytariladi (M1)"
```

---

### Task 7: H1 — `normalizePhone` divergent nusxasini o'chirish

**Files:**
- Modify: `apps/api/src/lib/telegram-bot-manager.ts:11-14`
- Test: `apps/api/src/lib/telegram-bot-manager.test.ts` (mavjud bo'lsa) yoki Create

**Interfaces:**
- Produces: `telegram-bot-manager.ts` endi `normalizePhone` EKSPORT QILMAYDI — import qiluvchilar `@dental/core`ga o'tadi

- [ ] **Step 1: Consumer'larni topish**

Run: `grep -rn "from './telegram-bot-manager\|from '../lib/telegram-bot-manager" apps/api/src | grep -i normaliz`
Har topilgan joyni `@dental/core` importiga o'tkazing.

- [ ] **Step 2: Failing test**

`apps/api/src/lib/telegram-bot-manager.test.ts` (yo'q bo'lsa yarating):

```ts
import { describe, expect, test } from 'bun:test';
import { normalizePhone } from '@dental/core';

describe('telegram bemor linking telefon kanonikligi', () => {
  test('9 xonali mahalliy format 998 prefiksini oladi', () => {
    // Eski lokal nusxa buni '+901234567' qilardi — kanonik shaklga mos
    // kelmagani uchun bemor topilmasdi.
    expect(normalizePhone('901234567')).toBe('+998901234567');
  });

  test("bo'sh kiritma bo'sh satr qaytaradi ('+' EMAS)", () => {
    expect(normalizePhone('')).toBe('');
  });

  test('davlat kodli format o\'zgarmaydi', () => {
    expect(normalizePhone('+998 90 123 45 67')).toBe('+998901234567');
  });
});
```

- [ ] **Step 3: Testni ishga tushirish**

Run: `cd apps/api && bun test src/lib/telegram-bot-manager.test.ts --env-file=../../.env`
Expected: PASS (`@dental/core` allaqachon to'g'ri) — bu test yangi xulqni QULFLAYDI

- [ ] **Step 4: Lokal nusxani o'chirish**

`telegram-bot-manager.ts` — 11-14 qatorlarni O'CHIRING:

```ts
export const normalizePhone = (raw: string): string => {
  const digits = raw.replace(/[^\d]/g, '');
  return `+${digits}`;
};
```

Fayl yuqorisidagi importga qo'shing:

```ts
import { normalizePhone } from '@dental/core';
```

`ctx.message.contact.phone_number` ishlatiladigan joy (`:50`) o'zgarishsiz qoladi —
endi kanonik funksiya chaqiriladi.

- [ ] **Step 5: Typecheck + testlar**

Run: `bun run typecheck && cd apps/api && bun test src/lib/ --env-file=../../.env`
Expected: toza + PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/telegram-bot-manager.ts apps/api/src/lib/telegram-bot-manager.test.ts
git commit -m "fix(api): normalizePhone divergent nusxasi o'chirildi — @dental/core ishlatiladi (H1)"
```

---

## L4 — Bemor telefoni kanonikligi

### Task 8: Yozish tomonida normalizatsiya + migratsiya

**Files:**
- Modify: `apps/api/src/modules/patients/patients.service.ts` (create, update, emergency contacts, relatives)
- Create: `apps/api/drizzle/0044_normalize_patient_phones.sql`
- Test: `apps/api/tests/integration/patient-phone-normalization.test.ts` (Create)

**Interfaces:**
- Produces: `patients.phone`, `patients.phone_secondary`, `patient_emergency_contacts.phone`, `patient_relatives.phone` (mavjud bo'lsa) — hammasi kanonik `+<raqamlar>` shaklda

- [ ] **Step 1: Telefon yoziladigan barcha joylarni topish**

Run: `grep -n "phone" apps/api/src/modules/patients/patients.service.ts | grep -E "input\.|values\("`

Ro'yxatni yozib oling — har biri Step 3 da normalizatsiyadan o'tadi. Kutilayotgan
joylar: `create` (phone, phoneSecondary), `update`, `addEmergencyContact`,
`addRelative` (mavjud bo'lsa).

- [ ] **Step 2: Failing test**

`apps/api/tests/integration/patient-phone-normalization.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test';
// setup helper'lari — mavjud patient integration testlaridan (masalan
// tests/integration/patient-balance.test.ts) nusxa oling: tenant yaratish,
// service qurish, RLS konteksti.

describe('bemor telefoni kanonikligi', () => {
  test('9 xonali kiritma kanonik shaklda saqlanadi', async () => {
    const patient = await service.create(tenantId, branchId, userId, {
      fullName: 'Test Bemor',
      phone: '901234567',
    });

    const row = await db.query.patients.findFirst({ where: eq(patients.id, patient.id) });
    expect(row!.phone).toBe('+998901234567');
  });

  test('formatlangan kiritma tozalanadi', async () => {
    const patient = await service.create(tenantId, branchId, userId, {
      fullName: 'Test Bemor 2',
      phone: '+998 (90) 123-45-67',
    });

    const row = await db.query.patients.findFirst({ where: eq(patients.id, patient.id) });
    expect(row!.phone).toBe('+998901234567');
  });

  test("bo'sh telefon null qoladi ('+' EMAS)", async () => {
    const patient = await service.create(tenantId, branchId, userId, {
      fullName: 'Telefonsiz Bemor',
    });

    const row = await db.query.patients.findFirst({ where: eq(patients.id, patient.id) });
    expect(row!.phone).toBeNull();
  });

  test('ikkilamchi telefon ham normallashtiriladi', async () => {
    const patient = await service.create(tenantId, branchId, userId, {
      fullName: 'Test Bemor 3',
      phone: '901234567',
      phoneSecondary: '911112233',
    });

    const row = await db.query.patients.findFirst({ where: eq(patients.id, patient.id) });
    expect(row!.phoneSecondary).toBe('+998911112233');
  });

  test('update ham normallashtiradi', async () => {
    const patient = await service.create(tenantId, branchId, userId, {
      fullName: 'Test Bemor 4',
    });
    await service.update(tenantId, patient.id, userId, { phone: '901234567' });

    const row = await db.query.patients.findFirst({ where: eq(patients.id, patient.id) });
    expect(row!.phone).toBe('+998901234567');
  });

  test('favqulodda kontakt telefoni normallashtiriladi', async () => {
    const patient = await service.create(tenantId, branchId, userId, {
      fullName: 'Test Bemor 5',
    });
    const contact = await service.addEmergencyContact(tenantId, patient.id, userId, {
      name: 'Qarindosh',
      phone: '901234567',
    });

    expect(contact.phone).toBe('+998901234567');
  });
});
```

⚠️ Service metod nomlari/signaturalari mavjud fayldan olinadi — yuqoridagi nomlar
taxminiy. Step 1 da topilgan haqiqiy signaturalarga moslang.

- [ ] **Step 3: Testni ishga tushirish — yiqilishini tasdiqlash**

Run: `cd apps/api && bun test tests/integration/patient-phone-normalization.test.ts --env-file=../../.env`
Expected: FAIL — xom qiymat saqlangan

- [ ] **Step 4: Yozish joylarida normalizatsiya**

`patients.service.ts` yuqorisiga (mavjud importga qo'shiladi):

```ts
import { normalizePhone } from '@dental/core';
```

Yordamchi (fayl yuqorisida, service factory'dan tashqarida):

```ts
// `normalizePhone('')` bo'sh satr qaytaradi — bazaga bo'sh satr emas, NULL
// yozilishi kerak (mavjud xulq: telefon berilmasa NULL).
const normalizeOptionalPhone = (raw?: string | null): string | null => {
  if (!raw) return null;
  const normalized = normalizePhone(raw);
  return normalized === '' ? null : normalized;
};
```

Step 1 da topilgan HAR joyda `input.phone ?? null` → `normalizeOptionalPhone(input.phone)`.
Majburiy telefon maydonlari uchun (masalan favqulodda kontakt) →
`normalizePhone(input.phone)`.

- [ ] **Step 5: Testni ishga tushirish**

Run: `cd apps/api && bun test tests/integration/patient-phone-normalization.test.ts --env-file=../../.env`
Expected: 6 PASS

- [ ] **Step 6: Mavjud qatorlar uchun migratsiya**

`apps/api/drizzle/0044_normalize_patient_phones.sql`:

```sql
-- Bemor telefonlarini yagona kanonik shaklga (`+<raqamlar>`) keltiradi. Qoida
-- `packages/core/src/phone.ts` `normalizePhone` bilan AYNAN bir xil.
--
-- 0043 (users.phone) dan FARQI: `patients.phone` UNIQUE EMAS (oila a'zolari
-- bitta raqamni ulashishi mumkin), shuning uchun to'qnashuv guard'i KERAK EMAS
-- va migratsiya hech qachon to'xtamaydi.
--
-- Bo'sh/raqamsiz qiymatlar NULL ga aylantiriladi ('+' yozib qo'yilmaydi).

UPDATE patients
SET phone = CASE
  WHEN regexp_replace(phone, '\D', '', 'g') = '' THEN NULL
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 9
    THEN '+998' || regexp_replace(phone, '\D', '', 'g')
  ELSE '+' || regexp_replace(phone, '\D', '', 'g')
END
WHERE phone IS NOT NULL;

UPDATE patients
SET phone_secondary = CASE
  WHEN regexp_replace(phone_secondary, '\D', '', 'g') = '' THEN NULL
  WHEN length(regexp_replace(phone_secondary, '\D', '', 'g')) = 9
    THEN '+998' || regexp_replace(phone_secondary, '\D', '', 'g')
  ELSE '+' || regexp_replace(phone_secondary, '\D', '', 'g')
END
WHERE phone_secondary IS NOT NULL;

UPDATE patient_emergency_contacts
SET phone = CASE
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 9
    THEN '+998' || regexp_replace(phone, '\D', '', 'g')
  ELSE '+' || regexp_replace(phone, '\D', '', 'g')
END
WHERE phone IS NOT NULL AND regexp_replace(phone, '\D', '', 'g') <> '';
```

⚠️ Step 1 da `patient_relatives` (yoki shunga o'xshash) jadvalda ham telefon ustuni
topilsa — u uchun ham xuddi shu UPDATE blokini qo'shing.

- [ ] **Step 7: Migratsiyani ishga tushirish va tekshirish**

Run: `cd apps/api && bun run drizzle:migrate`
Keyin qo'lda tekshirish:

```bash
docker exec dental-postgres psql -U dental -d dental -c \
  "SELECT count(*) FROM patients WHERE phone IS NOT NULL AND phone !~ '^\+[0-9]+$';"
```
Expected: `0`

- [ ] **Step 8: Commit**

```bash
bun run typecheck && bun run lint
git add apps/api/src/modules/patients/ apps/api/drizzle/0044_normalize_patient_phones.sql apps/api/tests/integration/patient-phone-normalization.test.ts
git commit -m "fix(patients): telefon yozishda kanonik shakl + mavjud qatorlar migratsiyasi"
```

---

### Task 9: Telefon bo'yicha qidiruvni normallashtirish

**Files:**
- Modify: `apps/api/src/modules/patients/patients.repository.ts` (yoki qidiruv qayerda bo'lsa)
- Test: `apps/api/tests/integration/patient-phone-normalization.test.ts` (Task 8 fayliga qo'shiladi)

**Interfaces:**
- Consumes: Task 8 ning kanonik saqlangan qiymatlari

- [ ] **Step 1: Qidiruv joyini topish**

Run: `grep -rn "ilike\|search" apps/api/src/modules/patients/patients.repository.ts | head -20`

Telefon qaysi predikatda qatnashishini aniqlang (odatda `fullName` bilan birga
`OR ilike`).

- [ ] **Step 2: Failing test**

```ts
test('9 xonali qidiruv kanonik saqlangan bemorni topadi', async () => {
  await service.create(tenantId, branchId, userId, {
    fullName: 'Qidiruv Bemori',
    phone: '901234567', // '+998901234567' bo'lib saqlanadi
  });

  const result = await service.list(tenantId, { search: '901234567' });

  expect(result.data.some((p) => p.fullName === 'Qidiruv Bemori')).toBe(true);
});

test('formatlangan qidiruv ham topadi', async () => {
  const result = await service.list(tenantId, { search: '+998 90 123 45 67' });
  expect(result.data.some((p) => p.fullName === 'Qidiruv Bemori')).toBe(true);
});

test('ism bo\'yicha qidiruv buzilmagan (regressiya)', async () => {
  const result = await service.list(tenantId, { search: 'Qidiruv' });
  expect(result.data.some((p) => p.fullName === 'Qidiruv Bemori')).toBe(true);
});
```

- [ ] **Step 3: Testni ishga tushirish — yiqilishini tasdiqlash**

Run: `cd apps/api && bun test tests/integration/patient-phone-normalization.test.ts --env-file=../../.env`
Expected: birinchi ikkita FAIL

- [ ] **Step 4: Qidiruvni normallashtirish**

Qidiruv predikatida telefon shoxi uchun normallashtirilgan variant ham qo'shiladi:

```ts
      // Foydalanuvchi telefonni istalgan formatda kiritadi ('901234567',
      // '+998 90 123 45 67'), baza esa kanonik saqlaydi — ikkala shoxni ham
      // sinaymiz: xom matn (ism uchun) va kanonik telefon (raqam uchun).
      const normalizedSearch = /\d/.test(search) ? normalizePhone(search) : null;

      const searchPredicate = or(
        ilike(patients.fullName, `%${search}%`),
        ilike(patients.phone, `%${search}%`),
        ...(normalizedSearch ? [ilike(patients.phone, `%${normalizedSearch}%`)] : []),
      );
```

⚠️ Mavjud predikat shakliga moslang (ustunlar ro'yxati farq qilishi mumkin) —
mavjud shoxlarni O'CHIRMANG, faqat yangisini qo'shing.

- [ ] **Step 5: Testni ishga tushirish**

Run: `cd apps/api && bun test tests/integration/patient-phone-normalization.test.ts --env-file=../../.env`
Expected: hammasi PASS

- [ ] **Step 6: Bemor moduli regressiyasi**

Run: `cd apps/api && bun test src/modules/patients/ --env-file=../../.env`
Expected: hammasi PASS

- [ ] **Step 7: Commit**

```bash
bun run typecheck && bun run lint
git add apps/api/src/modules/patients/ apps/api/tests/integration/patient-phone-normalization.test.ts
git commit -m "fix(patients): telefon qidiruvi kanonik shaklni ham qamraydi"
```

---

## L5 — Desktop gate (Task 3 dan keyin)

### Task 10: Desktop startup gate'i

**Files:**
- Modify: `apps/desktop/src/license-status.ts`
- Modify: `apps/desktop/src/main.ts:118` (`const target = ...`)
- Test: `apps/desktop/src/license-status.test.ts`

**Interfaces:**
- Consumes: Task 3 ning `GET /api/bootstrap-status` → `{ data: { hasLicense, hasTenant } }`
- Produces: `fetchBootstrapStatus(baseUrl, fetchImpl?): Promise<{ hasTenant: boolean } | null>` · `resolveStartupUrl(baseUrl, status): string`

- [ ] **Step 1: Failing test**

`license-status.test.ts` fayliga qo'shiladi:

```ts
import { describe, expect, test } from 'bun:test';
import { fetchBootstrapStatus, resolveStartupUrl } from './license-status.js';

describe('fetchBootstrapStatus', () => {
  test('javobni o\'qiydi', async () => {
    const fakeFetch = async () =>
      new Response(JSON.stringify({ data: { hasLicense: true, hasTenant: false } }));

    const status = await fetchBootstrapStatus('http://localhost:3000', fakeFetch as never);
    expect(status).toEqual({ hasTenant: false });
  });

  test('tarmoq xatosida null qaytaradi (bloklamaydi)', async () => {
    const fakeFetch = async () => {
      throw new Error('ECONNREFUSED');
    };

    const status = await fetchBootstrapStatus('http://localhost:3000', fakeFetch as never);
    expect(status).toBeNull();
  });

  test('noto\'g\'ri javob shaklida null qaytaradi', async () => {
    const fakeFetch = async () => new Response('not json');
    const status = await fetchBootstrapStatus('http://localhost:3000', fakeFetch as never);
    expect(status).toBeNull();
  });
});

describe('resolveStartupUrl', () => {
  test("tenant yo'q → /activate", () => {
    expect(resolveStartupUrl('http://localhost:3000', { hasTenant: false })).toBe(
      'http://localhost:3000/activate',
    );
  });

  test('tenant bor → asosiy UI', () => {
    expect(resolveStartupUrl('http://localhost:3000', { hasTenant: true })).toBe(
      'http://localhost:3000',
    );
  });

  test("status noma'lum (null) → hozirgi .lic xulqi saqlanadi", () => {
    // `.lic` bor deb faraz qilinadi (test muhitida LICENSE_PATH mavjud fayl).
    // null = so'rov muvaffaqiyatsiz — gate foydalanuvchini BLOKLAMAYDI.
    expect(resolveStartupUrl('http://localhost:3000', null)).toBe(
      licenseGatedUrl('http://localhost:3000'),
    );
  });
});
```

- [ ] **Step 2: Testni ishga tushirish — yiqilishini tasdiqlash**

Run: `cd apps/desktop && bun test src/license-status.test.ts`
Expected: FAIL — funksiyalar yo'q

- [ ] **Step 3: Implementatsiya**

`license-status.ts` oxiriga:

```ts
/**
 * Lokal API'dan "ilova ishlashga tayyormi" signalini oladi (audit C1).
 *
 * `hasLicense()` faqat FAYL mavjudligini ko'radi — `.lic` bor, lekin lokal
 * bazada tenant yo'q holatni (baza yo'qolgan / yangi kompyuter) ajrata olmaydi.
 * Bunda asosiy UI ochilib, login 401 berardi va foydalanuvchi sababni
 * bilmasdi.
 *
 * Xato bo'lsa `null` — gate foydalanuvchini BLOKLAMAYDI, hozirgi
 * `.lic`-asosidagi xulq saqlanadi (API hali ko'tarilmagan bo'lishi mumkin).
 *
 * `fetchImpl` injectable — test uchun.
 */
export const fetchBootstrapStatus = async (
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ hasTenant: boolean } | null> => {
  try {
    const res = await fetchImpl(`${baseUrl}/api/bootstrap-status`);
    const body = (await res.json()) as { data?: { hasTenant?: boolean } };
    if (typeof body?.data?.hasTenant !== 'boolean') return null;
    return { hasTenant: body.data.hasTenant };
  } catch {
    return null;
  }
};

/**
 * Startup manzili. `status === null` (so'rov muvaffaqiyatsiz) — hozirgi
 * `.lic`-asosidagi qaror saqlanadi.
 */
export const resolveStartupUrl = (
  baseUrl: string,
  status: { hasTenant: boolean } | null,
): string => {
  if (status === null) return licenseGatedUrl(baseUrl);
  // `/activate` sahifasi holatni O'ZI aniqlab "vendorga murojaat" matnini
  // ko'rsatadi (web Task 4) — bu yerda ikkinchi manzil kerak emas.
  return status.hasTenant ? baseUrl : `${baseUrl}/activate`;
};
```

- [ ] **Step 4: `main.ts` ni ulash**

`main.ts:118` atrofidagi `const target = hasLicense() ? DEV_URL : ...` o'rniga:

```ts
  const bootstrapStatus = await fetchBootstrapStatus(DEV_URL);
  const target = resolveStartupUrl(DEV_URL, bootstrapStatus);
```

⚠️ Chaqiruvchi funksiya `async` bo'lishi kerak. Agar u `void` kontekstda chaqirilsa,
mavjud `setTimeout(() => void mainWindow?.loadURL(target), 1000)` naqshini saqlang.
Import qo'shiladi: `fetchBootstrapStatus`, `resolveStartupUrl` (`./license-status.js`).

- [ ] **Step 5: Testlar**

Run: `cd apps/desktop && bun test src/license-status.test.ts`
Expected: 6 PASS

Run: `cd apps/desktop && bun test src/`
Expected: mavjud testlar ham PASS (`main.ts` bevosita testlanmaydi)

- [ ] **Step 6: Typecheck + lint + commit**

```bash
bun run typecheck && bun run lint
git add apps/desktop/src/license-status.ts apps/desktop/src/license-status.test.ts apps/desktop/src/main.ts
git commit -m "feat(desktop): startup gate bootstrap-status bilan tenant yo'qligini aniqlaydi"
```

> ⚠️ **Windows-only tasdiqlash:** `main.ts` o'zgarishi Linux'da ishga tushirilmaydi.
> `license-status.ts` funksiyalari to'liq unit-testlangan; `main.ts` ulanishi jismoniy
> PC'da qo'lda tekshiriladi (`docs/DESKTOP-WINDOWS-BUILD-TEST.md`).

---

## Yakuniy tekshiruv (barcha lane'lar merge qilingandan keyin)

- [ ] **Step 1: To'liq typecheck**

Run: `bun run typecheck --force`
Expected: 18/18 toza

⚠️ Harness `<new-diagnostics>` ko'pincha ESKIRGAN — `--force` authoritative.

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: 0 xato

- [ ] **Step 3: RLS qamrovi**

Run: `bun run check:rls`
Expected: mavjud son (38+), kamaymagan

- [ ] **Step 4: Redis rate-limit tozalash**

```bash
docker exec dental-redis redis-cli -a "$REDIS_PASSWORD" --scan --pattern 'rl:*' \
  | xargs -r docker exec -i dental-redis redis-cli -a "$REDIS_PASSWORD" del
```

- [ ] **Step 5: To'liq test to'plami (SERIAL)**

```bash
cd apps/supervisor-api && bun test
cd ../api && bun test --env-file=../../.env
cd ../web && bun run test
cd ../supervisor-admin && bun run test
cd ../desktop && bun test src/
```

Expected: yashil. **Ma'lum flake sinflari** (bizning kod emas, baseline'da ham bor —
alohida qayta ishga tushirilsa o'tadi): `cli-363/364-*-audit` + `clinical.test.ts`
`beforeEach` 5s timeout, `appointments-overlap`/`patient-overlap` konkurentlik,
`cli-226`/`477` reset testlari Redis `rl:*` iflosligidan 429.

- [ ] **Step 6: Qo'lda tiklanish oqimi (lokal, Linux)**

1. Supervisor'da klinika yarating → litsenziya kaliti + kredensiallar
2. `/api/activate` chaqiring → tenant yaratilganini tasdiqlang
3. Lokal `tenants` jadvalini tozalang (baza yo'qolishini simulyatsiya qilish)
4. `GET /api/bootstrap-status` → `{ hasLicense: true, hasTenant: false }` bo'lishini tasdiqlang
5. `/api/activate` qayta chaqiring → provisioning YO'Q (kutilgan qulflanish)
6. Admin panelda "Qayta o'rnatishga tayyorlash" → yangi kredensiallar
7. `/api/activate` qayta chaqiring → tenant QAYTA yaratildi
8. Yangi kredensiallar bilan login → muvaffaqiyat

⚠️ Bu qadam lokal `apps/supervisor-api/.env` `RSA_PRIVATE_KEY` `packages/core`dagi
ochiq kalit bilan JUFT bo'lishini talab qiladi (VM'dagi `~/supervisor-private.pem`) —
aks holda aktivatsiya 403 beradi.

---

## Hujjat yangilash (yakuniy)

- [ ] `CLAUDE.md` — yangi blok: audit + tiklanish oqimi
- [ ] Obsidian `01-Qarorlar.md` — Qaror #43 (qayta o'rnatishga tayyorlash: bitta amal, `provisionedAt` tegilmaydi)
- [ ] Obsidian `02-Savollar.md` — E2E bloklovchisi yopildi deb belgilash
- [ ] `AUDIT-2026-08-05-activation-login.md` — har topilma yoniga "✅ yopildi (commit)" belgisi
