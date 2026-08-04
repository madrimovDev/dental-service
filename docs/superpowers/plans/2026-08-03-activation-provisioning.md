# Aktivatsiya provisioning — implementatsiya rejasi

> **Agent ijrochilar uchun:** MAJBURIY SUB-SKILL — `superpowers:subagent-driven-development`
> (tavsiya) yoki `superpowers:executing-plans`. Qadamlar checkbox (`- [ ]`) bilan
> belgilanadi.

**Maqsad:** Supervisor klinika uchun owner (login/parol) va filial ma'lumotlarini
yaratsin; aktivatsiya paytida ular imzolangan blok orqali klinikaning lokal
bazasiga ko'chirilsin.

**Arxitektura:** `/v1/activate` javobiga tekis (flat) `provisioning` obyekti +
alohida `provisioningSignature` qo'shiladi. `apps/api` imzoni va shu
aktivatsiyaga bog'lanishini tekshirib, mavjud `registerTenant` mantig'idan
ajratilgan `provisionTenantInTx` bilan tenant+owner+filial+rol shablonlarini
bitta tranzaksiyada yaratadi. `.lic` faylga provisioning **yozilmaydi**.

**Spec:** [`docs/superpowers/specs/2026-08-03-activation-provisioning-design.md`](../specs/2026-08-03-activation-provisioning-design.md)

**Tech Stack:** Bun · Hono · Drizzle · Zod (apps/api & core: **Zod 4**;
apps/supervisor-api: **Zod 3**) · React 18 + Mantine v7 · Vitest (web/admin) ·
`bun test` (api/supervisor/core)

## Global Constraints

- Supervisor (`apps/supervisor-api`) va klinika (`apps/api`) — **alohida deploy
  unit**. Ular orasida workspace import qirrasi YO'Q. Umumiy kod (canonicalize,
  normalizePhone) **qo'lda dublikat** qilinadi + lockstep izohi yoziladi
  (`license-signature.ts` precedenti).
- Supervisor Zod **3** ishlatadi (`z.string().email()` va h.k. eski API),
  `apps/api` va `packages/core` Zod **4** (`zod4Resolver`, `.issues`).
- Imzolanadigan har qanday obyekt **tekis** bo'lishi shart — nested obyekt
  imzoga kirmaydi (`canonicalize` replacer massivi).
- `ownerPassword` **hech qachon** loglanmaydi va audit `after` maydoniga
  yozilmaydi.
- Parol siyosati: `min(12).max(128)` (`auth.schema.ts`dagi `password`).
- Har task oxirida: `bun run typecheck` (yoki mos filter) + o'sha task testlari
  yashil + commit.
- `apps/api` testlari: `bun test --env-file=../../.env <fayl>` (repo ildizidan
  `.env`). Web/admin testlari: `bunx vitest run <fayl>`.
- Telefon formati — yagona kanonik ko'rinish: `+998XXXXXXXXX`.

---

## Fayl xaritasi

| Fayl | Mas'uliyat |
|---|---|
| `packages/core/src/license-signature.ts` | canonicalize + verify; **tekis-obyekt guard** qo'shiladi |
| `packages/core/src/phone.ts` (yangi) | `normalizePhone` — yagona kanonik telefon shakli |
| `apps/supervisor-api/src/lib/rsa.ts` | sign/verify; tekis-obyekt guard (lockstep) |
| `apps/supervisor-api/src/lib/phone.ts` (yangi) | `normalizePhone` dublikati (lockstep) |
| `apps/supervisor-api/src/db/schema.ts` | `clinics` owner ustunlari, `licenses.provisioned_at` |
| `apps/supervisor-api/src/modules/clinics/clinics.routes.ts` | owner maydonlari, parol generatsiyasi, filial formadan |
| `apps/supervisor-api/src/modules/licenses/licenses.service.ts` | provisioning bloki, `provisioned()`, heartbeat tozalash |
| `apps/supervisor-api/src/modules/licenses/licenses.routes.ts` | `POST /v1/provisioned` |
| `apps/api/src/lib/license-client.ts` | activate javob tipi, `markProvisioned` |
| `apps/api/src/modules/auth/auth.service.ts` | `provisionTenantInTx`, `provisionFromLicense` |
| `apps/api/src/routes/activate.ts` | imzo+bog'lash tekshiruvi, provisioning, `.lic` pick |
| `apps/api/src/app.ts` | `activateRoutes({ db })` |
| `apps/api/src/modules/auth/auth.routes.ts` | `GET /auth/registration-enabled` |
| `apps/api/drizzle/00XX_normalize_user_phones.sql` (yangi) | telefon migratsiyasi (DO bloki) |
| `apps/web/src/features/auth/pages/activate.page.tsx` | login telefonini ko'rsatish |
| `apps/web/src/features/auth/auth.routes.tsx` | `/register-tenant` desktopda yashirish |
| `apps/supervisor-admin/src/features/clinics/*` | forma + hisob ma'lumotlari kartasi |

## Ijro fazalari (bog'liqliklar)

- **Faza A (parallel):** Task 1, Task 2, Task 3
- **Faza B (A dan keyin):** Task 4, Task 5
- **Faza C (A+B dan keyin):** Task 6, Task 7 (parallel) → Task 8
- **Faza D (parallel, C dan mustaqil):** Task 9, Task 10, Task 11

---

## Task 1: Imzo canonicalization guard

**Files:**
- Modify: `packages/core/src/license-signature.ts`
- Modify: `apps/supervisor-api/src/lib/rsa.ts`
- Test: `packages/core/src/license-signature.test.ts` (mavjud, kengaytiriladi)
- Test: `apps/supervisor-api/src/lib/rsa.test.ts` (mavjud bo'lmasa yaratiladi)

**Interfaces:**
- Consumes: —
- Produces: `canonicalize` endi nested obyektda `throw new Error('SIGNATURE_PAYLOAD_NOT_FLAT')`.
  Tekis payload uchun chiqish **bayt-ma-bayt o'zgarmaydi** (mavjud `.lic` fayllari ishlayveradi).

- [x] **Step 1: Failing test yozish (core)**

`packages/core/src/license-signature.test.ts` fayliga qo'shing:

```ts
import { describe, expect, it } from 'bun:test';
import { assertFlatSignaturePayload } from './license-signature';

describe('assertFlatSignaturePayload', () => {
  it('tekis obyektni qabul qiladi (string, number, boolean, string[])', () => {
    expect(() =>
      assertFlatSignaturePayload({ a: 'x', b: 1, c: true, d: ['p', 'q'] }),
    ).not.toThrow();
  });

  it('nested obyektda xato beradi — canonicalize uni jim tashlab yuboradi', () => {
    expect(() => assertFlatSignaturePayload({ a: 'x', nested: { b: 'y' } })).toThrow(
      'SIGNATURE_PAYLOAD_NOT_FLAT',
    );
  });

  it('obyektlar massivida ham xato beradi', () => {
    expect(() => assertFlatSignaturePayload({ a: [{ b: 'y' }] })).toThrow(
      'SIGNATURE_PAYLOAD_NOT_FLAT',
    );
  });

  it('null qiymatga ruxsat beradi', () => {
    expect(() => assertFlatSignaturePayload({ a: null })).not.toThrow();
  });
});
```

- [x] **Step 2: Testni ishga tushirib, yiqilishini tasdiqlash**

Run: `cd packages/core && bun test src/license-signature.test.ts`
Kutiladi: FAIL — `assertFlatSignaturePayload` eksport qilinmagan.

- [x] **Step 3: Implementatsiya (core)**

`packages/core/src/license-signature.ts` — `canonicalize`dan oldin qo'shing:

```ts
/**
 * `canonicalize`ning replacer massivi (`Object.keys(data).sort()`) JSON.stringify
 * tomonidan BARCHA ichki darajalarga qo'llanadi — nested obyekt kalitlari
 * ro'yxatda bo'lmagani uchun butunlay tushib qoladi va imzo ularni HIMOYA
 * QILMAYDI (`{"provisioning":{}}`). Shuning uchun imzolanadigan payload qat'iy
 * tekis bo'lishi shart. Tekis payload uchun canonicalize chiqishi o'zgarmaydi —
 * mavjud `.lic` fayllari va imzolar buzilmaydi.
 */
export const assertFlatSignaturePayload = (data: object): void => {
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) {
      if (value.some((item) => typeof item === 'object' && item !== null)) {
        throw new Error('SIGNATURE_PAYLOAD_NOT_FLAT');
      }
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      throw new Error('SIGNATURE_PAYLOAD_NOT_FLAT');
    }
  }
};
```

`verifyLicenseSignature` ichida, `createVerify`dan oldin:

```ts
  try {
    assertFlatSignaturePayload(data);
    const verify = createVerify('SHA256');
    ...
```

(mavjud `try/catch` `false` qaytaradi — nested payload'li imzo tekshiruvi
`false` bo'ladi, bu to'g'ri xulq.)

- [x] **Step 4: Testni ishga tushirib, o'tishini tasdiqlash**

Run: `cd packages/core && bun test src/license-signature.test.ts`
Kutiladi: PASS (barcha mavjud testlar ham yashil).

- [x] **Step 5: Supervisor tomonida bir xil guard**

`apps/supervisor-api/src/lib/rsa.ts` — xuddi shu `assertFlatSignaturePayload`
funksiyasi (nusxa, lockstep izohi bilan: "Verify-only duplicate — see
packages/core/src/license-signature.ts"). `signLicense` va `verifySignature`
ikkalasi ham chaqiradi. `signLicense`da **throw o'tkazib yuboriladi** (ushlab
qolinmaydi) — noto'g'ri payload imzolanmasin.

- [x] **Step 6: Supervisor testi**

`apps/supervisor-api/src/lib/rsa.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { generateKeyPair, signLicense, verifySignature } from './rsa';

describe('rsa flat-payload guard', () => {
  const { privateKey, publicKey } = generateKeyPair();

  it('tekis payload imzolanadi va tekshiriladi', () => {
    const payload = { licenseKey: 'K', modules: ['patients'], issuedAt: '2026-08-03T00:00:00.000Z' };
    const sig = signLicense(payload, privateKey);
    expect(verifySignature(payload, sig, publicKey)).toBe(true);
  });

  it('nested payload imzolashda xato beradi', () => {
    expect(() => signLicense({ a: 'x', nested: { b: 'y' } }, privateKey)).toThrow(
      'SIGNATURE_PAYLOAD_NOT_FLAT',
    );
  });
});
```

Run: `cd apps/supervisor-api && bun test src/lib/rsa.test.ts` → PASS

- [x] **Step 7: Typecheck + commit**

```bash
bun run typecheck
git add packages/core/src/license-signature.ts packages/core/src/license-signature.test.ts apps/supervisor-api/src/lib/rsa.ts apps/supervisor-api/src/lib/rsa.test.ts
git commit -m "fix(security): imzolanadigan payload qat'iy tekis bo'lishi majburlanadi

canonicalize replacer massivi nested obyekt kalitlarini jim tashlaydi —
nested payload imzo bilan himoyalanmasdi."
```

---

## Task 2: `normalizePhone`

**Files:**
- Create: `packages/core/src/phone.ts`
- Create: `packages/core/src/phone.test.ts`
- Create: `apps/supervisor-api/src/lib/phone.ts` (lockstep dublikat)
- Create: `apps/supervisor-api/src/lib/phone.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `normalizePhone(input: string): string` — Task 4, 8, 9, 11 ishlatadi.

- [x] **Step 1: Failing test**

`packages/core/src/phone.test.ts`:

```ts
import { describe, expect, it } from 'bun:test';
import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('+998 prefiksini saqlaydi', () => {
    expect(normalizePhone('+998901234567')).toBe('+998901234567');
  });

  it('+ belgisiz raqamga + qo\'shadi', () => {
    expect(normalizePhone('998901234567')).toBe('+998901234567');
  });

  it('bo\'sh joy, qavs va tirelarni olib tashlaydi', () => {
    expect(normalizePhone('+998 (90) 123-45-67')).toBe('+998901234567');
  });

  it('9 xonali mahalliy raqamga 998 prefiksini qo\'shadi', () => {
    expect(normalizePhone('901234567')).toBe('+998901234567');
  });

  it('boshqa davlat kodini o\'zgartirmaydi', () => {
    expect(normalizePhone('+79161234567')).toBe('+79161234567');
  });

  it('bo\'sh satr uchun bo\'sh satr qaytaradi', () => {
    expect(normalizePhone('')).toBe('');
  });
});
```

- [x] **Step 2: Testni ishga tushirib, yiqilishini tasdiqlash**

Run: `cd packages/core && bun test src/phone.test.ts`
Kutiladi: FAIL — `./phone` moduli yo'q.

- [x] **Step 3: Implementatsiya**

`packages/core/src/phone.ts`:

```ts
/**
 * Telefon raqamining yagona kanonik shakli: `+` + faqat raqamlar.
 *
 * `users.phone` — login identifikatori va platform bo'yicha unique (CLAUDE.md
 * §3.1). Normalizatsiyasiz `998901234567` va `+998901234567` ikki alohida hisob
 * bo'lib qoladi va login `eq(users.phone, input)` bilan mos kelmaydi.
 *
 * 9 xonali kiritma — O'zbekiston mahalliy formati (`901234567`), `998` prefiksi
 * qo'shiladi. Boshqa uzunliklar davlat kodi bilan kiritilgan deb hisoblanadi va
 * o'zgartirilmaydi.
 */
export const normalizePhone = (input: string): string => {
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';
  const withCountry = digits.length === 9 ? `998${digits}` : digits;
  return `+${withCountry}`;
};
```

`packages/core/src/index.ts` ga eksport qo'shing (mavjud eksport uslubiga mos).

- [x] **Step 4: Testni ishga tushirib, o'tishini tasdiqlash**

Run: `cd packages/core && bun test src/phone.test.ts` → PASS

- [x] **Step 5: Supervisor dublikati**

`apps/supervisor-api/src/lib/phone.ts` — bir xil kod, izoh sarlavhasi:

```ts
// Duplicate of packages/core/src/phone.ts — apps/supervisor-api is a separate
// deploy unit with no workspace dependency on @dental/core (license-signature.ts
// precedent). Keep in lockstep by hand: if the normalization rule changes, both
// files must change together or vendor-created accounts stop matching at login.
```

`apps/supervisor-api/src/lib/phone.test.ts` — Step 1 dagi testlarning nusxasi
(import yo'li `./phone`).

- [x] **Step 6: Testlar + typecheck + commit**

```bash
cd apps/supervisor-api && bun test src/lib/phone.test.ts
cd ../.. && bun run typecheck
git add packages/core/src/phone.ts packages/core/src/phone.test.ts packages/core/src/index.ts apps/supervisor-api/src/lib/phone.ts apps/supervisor-api/src/lib/phone.test.ts
git commit -m "feat(core): normalizePhone — telefon raqamining yagona kanonik shakli"
```

---

## Task 3: Supervisor sxemasi — owner ustunlari

**Files:**
- Modify: `apps/supervisor-api/src/db/schema.ts`
- Create: `apps/supervisor-api/drizzle/0002_*.sql` (drizzle-kit generatsiya qiladi)

**Interfaces:**
- Consumes: —
- Produces: `clinics.ownerFullName`, `clinics.ownerPhone`, `clinics.ownerTempPassword`,
  `clinics.defaultLanguage`, `licenses.provisionedAt` — Task 4, 5 ishlatadi.

- [x] **Step 1: Sxemani o'zgartirish**

`apps/supervisor-api/src/db/schema.ts`, `clinics` jadvaliga:

```ts
export const clinics = pgTable('clinics', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  // Provisioning (2026-08-03) — klinika lokal bazasida yaratiladigan owner
  // hisobi. `ownerTempPassword` faqat aktivatsiyagacha saqlanadi, keyin NULL.
  ownerFullName: text('owner_full_name').notNull(),
  ownerPhone: text('owner_phone').notNull(),
  ownerTempPassword: text('owner_temp_password'),
  defaultLanguage: text('default_language').notNull().default('uz'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

`licenses` jadvaliga `activatedAt`dan keyin:

```ts
  provisionedAt: timestamp('provisioned_at'),
```

- [x] **Step 2: Migratsiya generatsiya qilish**

Run: `cd apps/supervisor-api && bun run db:generate`

- [x] **Step 3: Migratsiyani mavjud qatorlar uchun xavfsiz qilish**

Generatsiya qilingan SQL `NOT NULL` ustunlarni bo'sh jadval sifatida qo'shadi va
mavjud qatorlarda yiqiladi. Faylni qo'lda quyidagi tartibga keltiring:

```sql
ALTER TABLE "clinics" ADD COLUMN "owner_full_name" text;
ALTER TABLE "clinics" ADD COLUMN "owner_phone" text;
ALTER TABLE "clinics" ADD COLUMN "owner_temp_password" text;
ALTER TABLE "clinics" ADD COLUMN "default_language" text DEFAULT 'uz' NOT NULL;
ALTER TABLE "licenses" ADD COLUMN "provisioned_at" timestamp;

-- Mavjud (provisioning'gacha yaratilgan) klinikalar uchun placeholder —
-- ular allaqachon qo'lda ro'yxatdan o'tgan, provisioning ularga qo'llanmaydi.
UPDATE "clinics" SET "owner_full_name" = COALESCE("owner_full_name", 'Noma''lum') WHERE "owner_full_name" IS NULL;
UPDATE "clinics" SET "owner_phone" = COALESCE("owner_phone", '') WHERE "owner_phone" IS NULL;

ALTER TABLE "clinics" ALTER COLUMN "owner_full_name" SET NOT NULL;
ALTER TABLE "clinics" ALTER COLUMN "owner_phone" SET NOT NULL;
```

- [x] **Step 4: Migratsiyani lokal bazada sinash**

Run: `cd apps/supervisor-api && bun run db:migrate`
Kutiladi: xatosiz o'tadi; `\d clinics` yangi ustunlarni ko'rsatadi.

> **Tekshiruv natijasi (2026-08-04, mustaqil verify):** migratsiya ikki yo'lda
> ham sinaldi — (a) bo'sh bazada 0000→0002 to'liq, (b) 0001 holatidagi bazada
> mavjud clinic/branch/license qatorlari bilan (prod VM 103 stsenariysi). Keyin
> haqiqiy lokal dev bazasida (`supervisor`, 648 clinic / 643 license) ishga
> tushirildi — xatosiz. Natija: `owner_full_name`/`owner_phone` NOT NULL
> majburlanadi (NULL bilan INSERT rad etiladi), `owner_temp_password` va
> `licenses.provisioned_at` nullable, `default_language` NOT NULL DEFAULT `'uz'`,
> eski 648 qator `Noma'lum` / `''` / `'uz'` bilan to'ldirilgan. Ustunlar
> `drizzle/meta/0002_snapshot.json` bilan aynan mos — `bun run db:generate`
> qayta ishga tushirilganda "No schema changes" (qo'lda tahrirlangan SQL
> snapshot'dan chetlashmagan). `cd apps/supervisor-api && bun run test` →
> 77 pass / 0 fail.

- [x] **Step 5: Typecheck + commit**

```bash
bun run typecheck
git add apps/supervisor-api/src/db/schema.ts apps/supervisor-api/drizzle/
git commit -m "feat(supervisor): clinics jadvaliga owner (login) ustunlari + licenses.provisioned_at"
```

---

## Task 4: Supervisor — klinika yaratishda owner va filial

**Files:**
- Modify: `apps/supervisor-api/src/modules/clinics/clinics.routes.ts`
- Test: `apps/supervisor-api/src/modules/clinics/clinics.routes.test.ts` (yangi bo'lsa yarating)

**Interfaces:**
- Consumes: Task 2 `normalizePhone` (`../../lib/phone`), Task 3 ustunlari.
- Produces: `POST /v1/admin/clinics` javobi
  `{ clinic, license, credentials: { loginPhone: string; tempPassword: string } }`
  — Task 11 (admin UI) shu shaklga tayanadi.

- [x] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'bun:test';
import { generateTempPassword } from './clinics.routes';

describe('generateTempPassword', () => {
  it('kamida 12 belgi (apps/api password siyosati: min(12).max(128))', () => {
    expect(generateTempPassword().length).toBeGreaterThanOrEqual(12);
  });

  it('har chaqiruvda boshqa qiymat', () => {
    expect(generateTempPassword()).not.toBe(generateTempPassword());
  });

  it('faqat chalkashmaydigan belgilar (0/O, 1/l/I yo\'q)', () => {
    expect(generateTempPassword()).toMatch(/^[A-HJ-NP-Za-hj-np-z2-9]+$/);
  });
});
```

Run: `cd apps/supervisor-api && bun test src/modules/clinics/clinics.routes.test.ts`
Kutiladi: FAIL — `generateTempPassword` eksport qilinmagan.

- [x] **Step 2: `generateTempPassword` implementatsiyasi**

`clinics.routes.ts` faylining yuqorisiga:

```ts
// Vaqtinchalik owner paroli. Operator uni og'zaki/qo'lda yetkazishi mumkin —
// chalkashadigan belgilar (0/O, 1/l/I) alifbodan chiqarilgan. 16 belgi
// (apps/api `password` siyosati min 12 talab qiladi).
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export const generateTempPassword = (): string =>
  Array.from(crypto.randomBytes(16), (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join(
    '',
  );
```

Run: test → PASS

- [x] **Step 3: Schema kengaytirish**

`createClinicSchema`ga (Zod **3** sintaksisi — supervisor Zod 3 ishlatadi):

```ts
const createClinicSchema = z.object({
  name: z.string().min(1),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  plan: z.enum(['starter', 'standard', 'premium', 'enterprise']),
  expiresAt: z.string(), // ISO date
  gracePeriodDays: z.number().int().min(1).max(365).default(30),
  // Provisioning — klinika lokal bazasida yaratiladigan birlamchi ma'lumot
  ownerFullName: z.string().min(2).max(120),
  ownerPhone: z.string().min(9).max(20),
  defaultLanguage: z.enum(['uz', 'ru']).default('uz'),
  branchName: z.string().min(1).max(120).default('Bosh filial'),
  branchAddress: z.string().max(255).optional(),
  branchPhone: z.string().max(20).optional(),
});
```

- [x] **Step 4: `POST /` handlerini yangilash**

Tranzaksiya ichida:

```ts
      const tempPassword = generateTempPassword();
      const ownerPhone = normalizePhone(data.ownerPhone);

      const [clinic] = await tx
        .insert(clinics)
        .values({
          name: data.name,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
          ownerFullName: data.ownerFullName,
          ownerPhone,
          ownerTempPassword: tempPassword,
          defaultLanguage: data.defaultLanguage,
        })
        .returning();
      if (!clinic) throw new Error('clinic insert returned no row');

      const [branch] = await tx
        .insert(branches)
        .values({
          clinicId: clinic.id,
          name: data.branchName,
          address: data.branchAddress ?? null,
          phone: data.branchPhone ? normalizePhone(data.branchPhone) : null,
        })
        .returning();
```

Tranzaksiya qaytish qiymatiga `tempPassword`ni qo'shing:

```ts
      return { clinic, branch, license, tempPassword };
```

Javob (parol AYNAN shu yerda va faqat shu yerda qaytariladi — loglanmaydi):

```ts
    return c.json({
      clinic: result.clinic,
      license: result.license,
      credentials: { loginPhone: result.clinic.ownerPhone, tempPassword: result.tempPassword },
    });
```

`GET /` va `GET /:id` javoblaridan `ownerTempPassword`ni **olib tashlamang** —
admin panel aktivatsiyagacha uni ko'rsatishi kerak (spec §7). Lekin `GET /`
(ro'yxat) javobiga qo'shmang: u faqat `GET /:id` detalida ko'rinadi.

- [x] **Step 5: Ro'yxat javobidan parolni chiqarib tashlash**

`GET /` handleridagi `rows.map(...)` da `...clinic` spread'i endi
`ownerTempPassword`ni ham qamrab oladi. Aniq tanlash bilan almashtiring:

```ts
    const data = rows.map((clinic) => {
      const l = licenseByClinic.get(clinic.id);
      return {
        id: clinic.id,
        name: clinic.name,
        contactEmail: clinic.contactEmail,
        contactPhone: clinic.contactPhone,
        ownerFullName: clinic.ownerFullName,
        ownerPhone: clinic.ownerPhone,
        createdAt: clinic.createdAt,
        license: l
          ? { licenseKey: l.licenseKey, plan: l.plan, isActive: l.isActive, expiresAt: l.expiresAt }
          : null,
      };
    });
```

- [x] **Step 6: Integratsiya testi**

```ts
it("klinika yaratishda owner va filial ma'lumoti saqlanadi", async () => {
  const res = await app.request('/v1/admin/clinics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: 'Test klinika',
      plan: 'premium',
      expiresAt: '2027-01-01',
      gracePeriodDays: 30,
      ownerFullName: 'Ali Valiyev',
      ownerPhone: '901234567',
      defaultLanguage: 'uz',
      branchName: 'Chilonzor filiali',
      branchAddress: 'Toshkent, Chilonzor 12',
      branchPhone: '712001020',
    }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.credentials.loginPhone).toBe('+998901234567');
  expect(body.credentials.tempPassword.length).toBeGreaterThanOrEqual(12);
  expect(body.clinic.ownerFullName).toBe('Ali Valiyev');
});

it("ro'yxat javobida vaqtinchalik parol yo'q", async () => {
  const res = await app.request('/v1/admin/clinics', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const body = await res.json();
  expect(JSON.stringify(body)).not.toContain('ownerTempPassword');
});
```

Run: `cd apps/supervisor-api && bun test src/modules/clinics/` → PASS

- [x] **Step 7: Typecheck + commit**

```bash
bun run typecheck
git add apps/supervisor-api/src/modules/clinics/
git commit -m "feat(supervisor): klinika yaratishda owner hisobi va filial ma'lumotlari"
```

---

## Task 5: Supervisor — imzolangan provisioning bloki

**Files:**
- Modify: `apps/supervisor-api/src/modules/licenses/licenses.service.ts`
- Modify: `apps/supervisor-api/src/modules/licenses/licenses.routes.ts`
- Test: `apps/supervisor-api/src/modules/licenses/licenses.test.ts` (mavjud)

**Interfaces:**
- Consumes: Task 1 guard, Task 3 ustunlari.
- Produces:
  - `activate()` javobi qo'shimcha `provisioning?: ProvisioningBlock` va
    `provisioningSignature?: string`.
  - `ProvisioningBlock = { licenseKey, clinicId, issuedAt, tenantName, defaultLanguage,
    ownerFullName, ownerPhone, ownerPassword, branchName, branchAddress, branchPhone }`
    — barcha maydonlar `string`, hech biri `undefined` emas.
  - Yangi `POST /v1/provisioned` → `{ ok: true }`.
  - Task 6 va Task 8 shu shakllarga tayanadi.

- [x] **Step 1: Failing test**

`licenses.test.ts`ga:

```ts
it('aktivatsiya provisioning blokini imzo bilan qaytaradi', async () => {
  const res = await service.activate(licenseKey, 'fp-1');
  expect(res.provisioning).toBeDefined();
  expect(res.provisioning!.ownerPhone).toBe('+998901234567');
  expect(res.provisioning!.licenseKey).toBe(licenseKey);
  expect(res.provisioning!.issuedAt).toBe(res.issuedAt);
  expect(res.provisioning!.branchAddress).toBe(''); // hech qachon undefined
  expect(verifySignature(res.provisioning!, res.provisioningSignature!, publicKey)).toBe(true);
});

it("parol o'chirilgach provisioning bloki qaytarilmaydi", async () => {
  await service.provisioned(licenseKey, 'fp-1');
  const res = await service.activate(licenseKey, 'fp-1');
  expect(res.provisioning).toBeUndefined();
});

it("provisioned() parolni tozalaydi va hodisa yozadi", async () => {
  await service.provisioned(licenseKey, 'fp-1');
  const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
  expect(clinic!.ownerTempPassword).toBeNull();
  const events = await db.select().from(licenseEvents).where(eq(licenseEvents.licenseId, licenseId));
  expect(events.some((e) => e.event === 'provisioned')).toBe(true);
});

it('heartbeat ham parolni tozalaydi (tasdiq yetib bormagan ssenariy)', async () => {
  await service.activate(licenseKey, 'fp-1');
  await service.heartbeat(licenseKey, 'fp-1');
  const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, clinicId) });
  expect(clinic!.ownerTempPassword).toBeNull();
});
```

Run: `cd apps/supervisor-api && bun test src/modules/licenses/licenses.test.ts`
Kutiladi: FAIL.

- [x] **Step 2: Provisioning bloki qurilishi**

`licenses.service.ts`ga:

```ts
export type ProvisioningBlock = {
  licenseKey: string;
  clinicId: string;
  issuedAt: string;
  tenantName: string;
  defaultLanguage: string;
  ownerFullName: string;
  ownerPhone: string;
  ownerPassword: string;
  branchName: string;
  branchAddress: string;
  branchPhone: string;
};

/**
 * Provisioning bloki QAT'IY TEKIS — `canonicalize` nested obyekt kalitlarini
 * tashlab yuboradi (lib/rsa.ts izohiga qarang). Bo'sh maydonlar `''` bilan
 * to'ldiriladi: `undefined` bo'lsa JSON.stringify kalitni butunlay tashlaydi
 * va klient tomondagi imzo tekshiruvi mos kelmaydi.
 *
 * Blok faqat `ownerTempPassword` hali mavjud bo'lganda quriladi — klinika
 * allaqachon aktivatsiya qilib bo'lgan bo'lsa (parol NULL) qaytarilmaydi.
 */
const buildProvisioning = async (
  lic: typeof licenses.$inferSelect,
  issuedAt: string,
): Promise<{ provisioning: ProvisioningBlock; provisioningSignature: string } | null> => {
  const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, lic.clinicId) });
  if (!clinic?.ownerTempPassword) return null;
  const branch = await db.query.branches.findFirst({ where: eq(branches.id, lic.branchId) });

  const provisioning: ProvisioningBlock = {
    licenseKey: lic.licenseKey,
    clinicId: lic.clinicId,
    issuedAt,
    tenantName: clinic.name,
    defaultLanguage: clinic.defaultLanguage,
    ownerFullName: clinic.ownerFullName,
    ownerPhone: clinic.ownerPhone,
    ownerPassword: clinic.ownerTempPassword,
    branchName: branch?.name ?? 'Bosh filial',
    branchAddress: branch?.address ?? '',
    branchPhone: branch?.phone ?? '',
  };
  return { provisioning, provisioningSignature: signLicense(provisioning, PRIVATE_KEY) };
};
```

`clinics` va `branches` importlarini `../../db/schema`dan qo'shing.

> ⚠️ **Task 3 migratsiyasidan kelib chiqadigan chekka holat:** eski (provisioning
> joriy qilinishidan oldingi) klinika qatorlarida `owner_phone` bo'sh satr
> (`''`) bilan to'ldirilgan — Supervisor prod bazasida 648 shunday qator bor.
> `ownerTempPassword` NULL bo'lgani uchun ular yuqoridagi guard'dan o'tmaydi va
> provisioning bloki qurilmaydi. Shunga qaramay himoyani ikkilantirish uchun
> guard'ni `if (!clinic?.ownerTempPassword || !clinic.ownerPhone) return null;`
> qilib yozing — `ownerPhone` klinika tomonida login identifikatori
> (CLAUDE.md §3.1) va bo'sh telefonli hisob yaratilib qolmasin.

- [x] **Step 3: `activate()`ga ulash**

`activate()` oxirida:

```ts
    const issuedAt = new Date().toISOString();
    const base = buildResponse({ ...lic, fingerprint }, issuedAt);
    const prov = await buildProvisioning(lic, issuedAt);
    return prov ? { ...base, ...prov } : base;
```

⚠️ `buildResponse` chaqiruvi o'zgarmaydi — provisioning **litsenziya imzosiga
kirmaydi**, o'zining alohida imzosi bor.

- [x] **Step 4: `provisioned()` metodi**

```ts
  /**
   * Klinika provisioning'ni muvaffaqiyatli qo'llagach chaqiriladi (apps/api
   * `/api/activate`dan). Vaqtinchalik parolni Supervisor bazasidan o'chiradi —
   * bundan keyin uni faqat mijoz biladi.
   */
  async provisioned(licenseKey: string, fingerprint: string) {
    const lic = await db.query.licenses.findFirst({
      where: eq(licenses.licenseKey, licenseKey),
    });
    if (!lic) throw Object.assign(new Error('INVALID_KEY'), { status: 403 });
    if (lic.fingerprint !== fingerprint) {
      throw Object.assign(new Error('FINGERPRINT_MISMATCH'), { status: 403 });
    }
    await clearTempPassword(lic);
    await db.insert(licenseEvents).values({
      licenseId: lic.id,
      event: 'provisioned',
      fingerprint,
    });
    return { ok: true as const };
  },
```

Umumiy helper:

```ts
// Tasdiq so'rovi yetib bormasligi mumkin (tarmoq) — heartbeat ham shu ishni
// qiladi, shunda parol Supervisor bazasida cheksiz qolib ketmaydi.
const clearTempPassword = async (lic: typeof licenses.$inferSelect) => {
  await db.update(clinics).set({ ownerTempPassword: null }).where(eq(clinics.id, lic.clinicId));
  if (!lic.provisionedAt) {
    await db.update(licenses).set({ provisionedAt: new Date() }).where(eq(licenses.id, lic.id));
  }
};
```

`heartbeat()`da `lastHeartbeatAt` yangilangandan keyin `await clearTempPassword(lic);`
qo'shing.

- [x] **Step 5: Route qo'shish**

`licenses.routes.ts`:

```ts
  // Klinika provisioning'ni qo'lladi — vaqtinchalik parolni o'chirish.
  // Public (activate kabi) — auth yo'q, fingerprint bog'lash himoya qiladi.
  app.post('/provisioned', zValidator('json', activateSchema), async (c) => {
    try {
      const { licenseKey, fingerprint } = c.req.valid('json');
      const data = await service.provisioned(licenseKey, fingerprint);
      return c.json(data);
    } catch (e: any) {
      return c.json({ error: { code: e.message } }, e.status ?? 500);
    }
  });
```

- [x] **Step 6: Testlar + typecheck + commit**

```bash
cd apps/supervisor-api && bun test src/modules/licenses/
cd ../.. && bun run typecheck
git add apps/supervisor-api/src/modules/licenses/
git commit -m "feat(supervisor): aktivatsiyada imzolangan provisioning bloki + /v1/provisioned"
```

**Ijro paytidagi og'ishlar (qasddan):**

1. `provisioned()` `heartbeat` kabi `NOT_ACTIVATED` guard'iga ega
   (`lic.fingerprint` NULL → 403). Rejadagi snippet faqat mismatch'ni
   tekshirardi — NULL fingerprint `null !== 'fp'` bo'lgani uchun baribir
   mismatch beradi, lekin xato kodi chalg'ituvchi edi. Provisioning faqat
   aktivatsiya orqali yetkaziladi (CLI-411 fail-closed precedenti).
2. `heartbeat()`da `clearTempPassword` `if (!lic.provisionedAt)` bilan
   o'ralgan — aks holda har heartbeat'da `clinics` jadvaliga ma'nosiz UPDATE
   yuborilardi (parol allaqachon NULL).
3. Testlar service darajasida (`licenses.reset.test.ts` precedenti) + route
   wiring uchun ikkita `app.request('/v1/provisioned')` testi. Imzo tekshiruvi
   `RSA_PRIVATE_KEY`dan `createPublicKey` bilan olingan JUFT kalit bilan
   (`generateKeyPair()` yangi juft yasab, doim `false` berardi).
4. `/v1/provisioned` rate-limit'siz (izoh route'da) — fingerprint bog'lanishi
   himoya qiladi, eng yomon holat heartbeat baribir bajaradigan ish.

**Mustaqil tekshiruv (verify-agent) natijasi va qo'shimchalari:**

- **Mutatsiya sinovi:** `|| !clinic.ownerPhone` guard'ini olib tashlash HECH
  QANDAY testni yiqitmasdi — Step 2 ⚠️ bloki aniq talab qilgan himoya
  qoplanmagan edi. Regressiya testi qo'shildi ("bo'sh ownerPhone'li klinikada
  blok qurilmaydi"); endi mutatsiya o'ldiriladi.
- **Audit bo'shlig'i (CLAUDE.md §3.10):** `heartbeat` yo'li vaqtinchalik
  parolni o'chirar, lekin `license_events`ga hech nima yozmasdi — maxfiy
  ma'lumot izsiz yo'q bo'lardi. `heartbeat` endi `event:'provisioned'` +
  `metadata:{ source:'heartbeat' }` yozadi (aniq tasdiqdan ajratish uchun);
  `provisionedAt` to'lgach takrorlanmaydi. Test bilan qulflandi.
- **Cross-app imzo tasdig'i:** provisioning bloki `apps/supervisor-api`da
  imzolanib, `packages/core`ning `verifyLicenseSignature`i (klinika tomoni
  ishlatadigan verify nusxasi) bilan `true` beradi; bitta maydon o'zgartirilsa
  `false`. `issuedAt` litsenziya payloadi bilan aynan bir xil (mutatsiya bilan
  tasdiqlangan). Blok 11 ta tekis `string` maydon, JSON round-trip'da kalit
  tushmaydi.
- **Task 4 xavfsizlik (qiymat bo'yicha):** parol qiymati faqat `POST /`
  javobidagi `credentials` va `GET /:id` detalida uchraydi; `GET /` va
  `PATCH /:id/deactivate` javoblarida yo'q. `generateTempPassword`
  `node:crypto.randomBytes` ishlatadi (200 ta chaqiruvda 0 takror, 16 belgi,
  siyosat min 12). Supervisor'da so'rov/javob logger middleware'i umuman yo'q,
  parol hech qayerda loglanmaydi.
- **Ochiq follow-up (yangi ticket):** (a) `reactivate()` provisioning blokini
  qaytarmaydi — mashina almashtirilganda yangi lokal bazada owner hisobini
  yaratish yo'li yo'q; (b) `assertFlatSignaturePayload` `undefined` qiymatni
  rad etmaydi — tushib qolgan kalit imzo tekshiruvini jim buzadi (ikki deploy
  unitda lockstep tuzatish kerak).

---

## Task 6: `apps/api` — license-client provisioning tiplari

**Files:**
- Modify: `apps/api/src/lib/license-client.ts`
- Test: `apps/api/src/lib/license-client.test.ts` (mavjud)

**Interfaces:**
- Consumes: Task 5 javob shakli.
- Produces:
  - `type ProvisioningBlock` (Task 5 dagi bilan bir xil maydonlar).
  - `activateLicense(licenseKey): Promise<LicenseData & { provisioning?: ProvisioningBlock; provisioningSignature?: string }>`
  - `markProvisioned(licenseKey: string): Promise<void>` — xatoni yutadi (best-effort).
  - Task 8 shularni ishlatadi.

- [x] **Step 1: Failing test**

```ts
it('activateLicense provisioning blokini o\'zgarishsiz qaytaradi', async () => {
  // fetch mock: provisioning bilan javob
  const res = await activateLicense('KEY-1');
  expect(res.provisioning?.ownerPhone).toBe('+998901234567');
  expect(res.provisioningSignature).toBe('sig-1');
});

it('markProvisioned tarmoq xatosida throw qilmaydi', async () => {
  // fetch mock: reject
  await expect(markProvisioned('KEY-1')).resolves.toBeUndefined();
});
```

Run: `bun test --env-file=../../.env src/lib/license-client.test.ts` (apps/api ichidan)
Kutiladi: FAIL.

- [x] **Step 2: Implementatsiya**

```ts
export type ProvisioningBlock = {
  licenseKey: string;
  clinicId: string;
  issuedAt: string;
  tenantName: string;
  defaultLanguage: string;
  ownerFullName: string;
  ownerPhone: string;
  ownerPassword: string;
  branchName: string;
  branchAddress: string;
  branchPhone: string;
};

export type ActivateResult = LicenseData & {
  provisioning?: ProvisioningBlock;
  provisioningSignature?: string;
};
```

`post()`ning qaytish tipini `LicenseData`dan generic'ga kengaytiring yoki
`activateLicense` uchun alohida `postActivate` yozing — `heartbeat` xulqi
o'zgarmasin.

```ts
/**
 * Provisioning muvaffaqiyatli qo'llangani haqida Supervisor'ga xabar beradi —
 * u vaqtinchalik parolni bazasidan o'chiradi. Best-effort: tarmoq xatosi
 * aktivatsiyani buzmasligi kerak (Supervisor keyingi heartbeat'da baribir
 * tozalaydi).
 */
export const markProvisioned = async (licenseKey: string): Promise<void> => {
  try {
    const fingerprint = await getFingerprint();
    await fetch(`${SUPERVISOR_URL}/v1/provisioned`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, fingerprint }),
    });
  } catch {
    // no-op
  }
};
```

- [x] **Step 3: Test → PASS, typecheck, commit**

```bash
cd apps/api && bun test --env-file=../../.env src/lib/license-client.test.ts
cd ../.. && bun run typecheck
git add apps/api/src/lib/license-client.ts apps/api/src/lib/license-client.test.ts
git commit -m "feat(api): license-client provisioning tiplari + markProvisioned"
```

---

## Task 7: `apps/api` — `provisionTenantInTx` ajratish

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts:148-212`
- Test: `apps/api/src/modules/auth/auth.service.test.ts` (mavjud bo'lmasa yarating)

**Interfaces:**
- Consumes: Task 2 `normalizePhone`.
- Produces:
  ```ts
  type ProvisionInput = {
    tenantName: string;
    ownerPhone: string;
    ownerFullName: string;
    ownerPassword: string;
    defaultLanguage: 'uz' | 'ru';
    branchName?: string;
    branchAddress?: string | null;
    branchPhone?: string | null;
    auditAction?: string; // default 'tenant.registered'
  };
  provisionTenantInTx(tx, input): Promise<{ userId, tenantId, slug, branchId }>
  ```
  Task 8 `provisionFromLicense` orqali ishlatadi.

- [ ] **Step 1: Failing test**

```ts
it('provisionTenantInTx filial nomi va manzilini qabul qiladi', async () => {
  const result = await db.transaction((tx) =>
    provisionTenantInTx(tx, {
      tenantName: 'Test klinika',
      ownerPhone: '901234567',
      ownerFullName: 'Ali Valiyev',
      ownerPassword: 'ParolParol123',
      defaultLanguage: 'uz',
      branchName: 'Chilonzor filiali',
      branchAddress: 'Toshkent, Chilonzor 12',
    }),
  );
  const [branch] = await db.select().from(branches).where(eq(branches.id, result.branchId));
  expect(branch.name).toBe('Chilonzor filiali');
  expect(branch.address).toBe('Toshkent, Chilonzor 12');
  const [user] = await db.select().from(users).where(eq(users.id, result.userId));
  expect(user.phone).toBe('+998901234567'); // normallashtirilgan
});

it('provisionTenantInTx 8 rol shablonini seed qiladi', async () => {
  const result = await db.transaction((tx) => provisionTenantInTx(tx, { /* ...yuqoridagi */ }));
  const roleRows = await db.select().from(roles).where(eq(roles.tenantId, result.tenantId));
  expect(roleRows.length).toBe(8);
});
```

- [ ] **Step 2: Ajratish**

`registerTenant` tanasini `provisionTenantInTx(tx, input)`ga ko'chiring.
O'zgarishlar:

```ts
      const passwordHash = await hashPassword(input.ownerPassword);
      const [user] = await tx
        .insert(users)
        .values({
          phone: normalizePhone(input.ownerPhone),
          passwordHash,
          fullName: input.ownerFullName,
          preferredLanguage: input.defaultLanguage,
        })
        .returning({ id: users.id, phone: users.phone });
      ...
      const [branch] = await tx
        .insert(branches)
        .values({
          tenantId: tenant.id,
          name: input.branchName?.trim() || 'Bosh filial',
          address: input.branchAddress ?? null,
          phone: input.branchPhone ? normalizePhone(input.branchPhone) : null,
        })
        .returning({ id: branches.id });
      ...
      await tx.insert(auditLog).values({
        tenantId: tenant.id,
        userId: user.id,
        action: input.auditAction ?? 'tenant.registered',
        resourceType: 'tenant',
        resourceId: tenant.id,
        before: null,
        after: { name: input.tenantName, slug: tenant.slug }, // parol YO'Q
      });
```

`registerTenant` endi shunchaki:

```ts
  async function registerTenant(input: RegisterTenantInput) {
    return await db.transaction((tx) => provisionTenantInTx(tx, input));
  }
```

`provisionTenantInTx` modul darajasida (factory tashqarisida) eksport qilinadi —
`activate.ts` uni `createAuthService`siz chaqira olsin.

- [ ] **Step 3: Test → PASS**

Run: `cd apps/api && bun test --env-file=../../.env src/modules/auth/`
Kutiladi: PASS — mavjud `registerTenant` testlari ham yashil (xulq o'zgarmadi,
telefon endi normallashtiriladi).

- [ ] **Step 4: Commit**

```bash
bun run typecheck
git add apps/api/src/modules/auth/
git commit -m "refactor(api): provisionTenantInTx ajratildi — registerTenant va provisioning umumiy yo'l"
```

---

## Task 8: `apps/api` — aktivatsiyada provisioning

**Files:**
- Modify: `apps/api/src/routes/activate.ts`
- Modify: `apps/api/src/app.ts:143`
- Test: `apps/api/src/routes/activate.test.ts` (mavjud)
- Test: `apps/api/tests/integration/provisioning-activate.test.ts` (yangi)

**Interfaces:**
- Consumes: Task 6 (`ActivateResult`, `markProvisioned`), Task 7 (`provisionTenantInTx`),
  Task 1 (`verifyLicenseSignature`).
- Produces: `activateRoutes(deps: { db: Database })`; javob
  `{ modules, expiresAt, ownerPhone?: string }`.

- [ ] **Step 1: Failing testlar**

`apps/api/tests/integration/provisioning-activate.test.ts`:

```ts
it("to'g'ri imzolangan provisioning tenant va owner yaratadi", async () => {
  const res = await app.request('/api/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseKey: KEY }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.data.ownerPhone).toBe('+998901234567');

  const [user] = await db.select().from(users).where(eq(users.phone, '+998901234567'));
  expect(user).toBeDefined();
  const tenantRows = await db.select().from(tenants);
  expect(tenantRows.length).toBe(1);
});

it("buzilgan imzo → 403 va .lic yozilmaydi", async () => {
  // supervisor mock: provisioningSignature = 'buzilgan'
  const res = await app.request('/api/activate', { /* ... */ });
  expect(res.status).toBe(403);
  expect(await readLicense()).toBeNull();
  expect((await db.select().from(tenants)).length).toBe(0);
});

it("boshqa klinikaning haqiqiy imzolangan bloki → 403 (bog'lash)", async () => {
  // supervisor mock: provisioning.licenseKey = 'BOSHQA-KALIT' (imzo TO'G'RI)
  const res = await app.request('/api/activate', { /* ... */ });
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe('PROVISIONING_MISMATCH');
  expect((await db.select().from(tenants)).length).toBe(0);
});

it('ikkinchi aktivatsiya owner parolini o\'zgartirmaydi', async () => {
  await activateOnce();
  const [before] = await db.select().from(users).where(eq(users.phone, '+998901234567'));
  await activateOnce();
  const [after] = await db.select().from(users).where(eq(users.phone, '+998901234567'));
  expect(after.passwordHash).toBe(before.passwordHash);
  expect((await db.select().from(tenants)).length).toBe(1);
});

it('yozilgan .lic haqiqiy qoladi (provisioning fayl payloadiga kirmaydi)', async () => {
  await activateOnce();
  const lic = await readLicense();
  expect(lic).not.toBeNull();
  expect(isLicenseValid(lic!, await getFingerprint())).toBe(true);
  expect(JSON.stringify(lic)).not.toContain('ownerPassword');
});
```

Run: `cd apps/api && bun test --env-file=../../.env tests/integration/provisioning-activate.test.ts`
Kutiladi: FAIL.

- [ ] **Step 2: `activate.ts` implementatsiyasi**

```ts
export const activateRoutes = (deps: { db: Database }) => {
  const app = new Hono();
  // ...rate limit o'zgarishsiz...

  app.post('/', activateRateLimit, async (c) => {
    const json = await c.req.json().catch(() => null);
    const parsed = activateSchema.safeParse(json);
    if (!parsed.success) {
      return c.json(fail('INVALID_REQUEST', 'licenseKey majburiy'), 400);
    }

    try {
      const data = await activateLicense(parsed.data.licenseKey);
      const { provisioning, provisioningSignature, ...licensePayload } = data;

      let ownerPhone: string | undefined;
      if (provisioning) {
        // 1) Imzo — vendor haqiqatan imzolaganmi
        if (
          !provisioningSignature ||
          !verifyLicenseSignature(provisioning, provisioningSignature, SUPERVISOR_PUBLIC_KEY_PEM)
        ) {
          return c.json(
            fail('PROVISIONING_SIGNATURE_INVALID', "Provisioning ma'lumoti ishonchsiz"),
            403,
          );
        }
        // 2) Bog'lash — imzo o'zi yetarli emas: boshqa klinikaning HAQIQIY
        //    imzolangan bloki ham imzo tekshiruvidan o'tadi. Blok aynan shu
        //    aktivatsiyaga tegishli ekanini majburlaymiz.
        if (
          provisioning.licenseKey !== parsed.data.licenseKey ||
          provisioning.licenseKey !== licensePayload.licenseKey ||
          provisioning.clinicId !== licensePayload.clinicId ||
          provisioning.issuedAt !== licensePayload.issuedAt
        ) {
          return c.json(
            fail('PROVISIONING_MISMATCH', "Provisioning ma'lumoti bu litsenziyaga tegishli emas"),
            403,
          );
        }
        ownerPhone = provisioning.ownerPhone;
        await applyProvisioning(deps.db, provisioning);
      }

      // `.lic`ka AYNAN LicenseData maydonlari yoziladi — qo'shimcha maydon
      // `isLicenseValid`dagi `{ signature, ...payload }` orqali imzo
      // tekshiruviga kirib uni buzardi.
      await writeLicense({
        licenseKey: licensePayload.licenseKey,
        clinicId: licensePayload.clinicId,
        modules: licensePayload.modules,
        expiresAt: licensePayload.expiresAt,
        gracePeriodDays: licensePayload.gracePeriodDays,
        issuedAt: licensePayload.issuedAt,
        fingerprint: licensePayload.fingerprint,
        signature: licensePayload.signature,
      });

      if (provisioning) await markProvisioned(parsed.data.licenseKey);

      return c.json(ok({ modules: data.modules, expiresAt: data.expiresAt, ownerPhone }));
    } catch (err) {
      // ...mavjud xato ishlovi o'zgarishsiz...
    }
  });

  return app;
};
```

`applyProvisioning` — shu fayl ichida:

```ts
/**
 * Idempotent: lokal bazada tenant allaqachon bo'lsa (mijoz o'zi
 * `/register-tenant` orqali yaratgan yoki takroriy aktivatsiya) HECH NARSA
 * o'zgartirilmaydi. Aks holda litsenziya kalitiga ega har kim owner parolini
 * qayta yozib hisobni egallagan bo'lardi. Parol unutilsa — CLI-476
 * vendor-reset oqimi.
 */
const applyProvisioning = async (db: Database, p: ProvisioningBlock): Promise<void> => {
  const existing = await db.select({ id: tenants.id }).from(tenants).limit(1);
  if (existing.length > 0) {
    logger.warn(
      { clinicId: p.clinicId },
      'tenant.provisioning_skipped — lokal bazada tenant allaqachon mavjud',
    );
    return;
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
};
```

⚠️ `logger.warn`da **parol yo'q** — faqat `clinicId`.

- [ ] **Step 3: `app.ts` yangilash**

`apps/api/src/app.ts:143`:

```ts
  app.route('/api/activate', activateRoutes({ db }));
```

- [ ] **Step 4: Testlar → PASS**

Run:
```bash
cd apps/api
bun test --env-file=../../.env tests/integration/provisioning-activate.test.ts
bun test --env-file=../../.env src/routes/activate.test.ts
bun test --env-file=../../.env tests/integration/cli-370-activate-rate-limit.test.ts
```
Uchalasi ham PASS.

- [ ] **Step 5: Commit**

```bash
cd ../.. && bun run typecheck
git add apps/api/src/routes/activate.ts apps/api/src/app.ts apps/api/tests/integration/provisioning-activate.test.ts
git commit -m "feat(api): aktivatsiyada provisioning — imzo + bog'lash tekshiruvi, idempotent tenant yaratish"
```

---

## Task 9: Telefon normalizatsiyasi — qolgan chaqiruv joylari + migratsiya

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts` (`login`)
- Modify: `apps/api/src/modules/users/users.service.ts:83,94`
- Modify: `apps/api/src/routes/reset-owner-password.ts`
- Create: `apps/api/drizzle/00XX_normalize_user_phones.sql`
- Test: `apps/api/tests/integration/phone-normalization.test.ts` (yangi)

**Interfaces:**
- Consumes: Task 2 `normalizePhone`.
- Produces: barcha `users.phone` yozish/qidirish nuqtalari kanonik shaklda.

- [ ] **Step 1: Chaqiruv joylarini to'liq aniqlash**

Run: `grep -rn "users\.phone" apps/api/src --include="*.ts" | grep -v "\.test\.ts"`

Ro'yxatni Step 2 dagi bilan solishtiring. **Yangi joy topilsa** — uni ham
normallashtiring va rejaga qo'shing. (`patients.phone` TEGILMAYDI — bemor
telefoni login identifikatori emas.)

- [ ] **Step 2: Failing test**

```ts
it('login formati boshqacha yozilgan raqam bilan ham ishlaydi', async () => {
  // user '+998901234567' bilan yaratilgan
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '998 90 123 45 67', password: 'ParolParol123' }),
  });
  expect(res.status).toBe(200);
});

it("xodim taklifi mavjud foydalanuvchini boshqa formatda ham topadi", async () => {
  // '+998901234567' mavjud; '901234567' bilan taklif → dublikat user yaratilmaydi
  const before = (await db.select().from(users)).length;
  await service.invite({ phone: '901234567', fullName: 'Ali', roleId });
  expect((await db.select().from(users)).length).toBe(before);
});
```

- [ ] **Step 3: Implementatsiya**

`auth.service.ts` `login()`:

```ts
      .where(and(eq(users.phone, normalizePhone(input.phone)), isNull(users.deletedAt)));
```

`users.service.ts:83` va `:94`: `input.phone` → `normalizePhone(input.phone)`
(bir marta yuqorida `const phone = normalizePhone(input.phone);` deb hisoblab,
ikkala joyda ishlating).

`routes/reset-owner-password.ts`: owner telefonini qidirish/yozish joylarida
xuddi shunday.

- [ ] **Step 4: Migratsiya**

`apps/api/drizzle/00XX_normalize_user_phones.sql` (raqamni mavjud eng katta
migratsiyadan keyingisi qilib qo'ying):

```sql
-- users.phone kanonik shaklga (+<raqamlar>) keltiriladi. `users.phone` platform
-- bo'yicha UNIQUE — normalizatsiyadan keyin ikki qator to'qnashsa oddiy UPDATE
-- unique-indeks xatosi bilan yiqilardi. Shuning uchun avval to'qnashuvni
-- aniqlaymiz va aniq xabar bilan to'xtaymiz: qaysi hisob haqiqiy ekanini faqat
-- inson hal qila oladi (jim birlashtirish YO'Q).
DO $$
DECLARE
  conflict_rows text;
BEGIN
  SELECT string_agg(format('%s -> %s', ids, norm), '; ')
    INTO conflict_rows
  FROM (
    SELECT
      CASE
        WHEN length(regexp_replace(phone, '\D', '', 'g')) = 9
          THEN '+998' || regexp_replace(phone, '\D', '', 'g')
        ELSE '+' || regexp_replace(phone, '\D', '', 'g')
      END AS norm,
      string_agg(id::text, ',') AS ids,
      count(*) AS cnt
    FROM users
    WHERE deleted_at IS NULL
    GROUP BY 1
    HAVING count(*) > 1
  ) c;

  IF conflict_rows IS NOT NULL THEN
    RAISE EXCEPTION 'Telefon normalizatsiyasi to''xtatildi — to''qnashuvlar: %', conflict_rows;
  END IF;

  UPDATE users
  SET phone = CASE
    WHEN length(regexp_replace(phone, '\D', '', 'g')) = 9
      THEN '+998' || regexp_replace(phone, '\D', '', 'g')
    ELSE '+' || regexp_replace(phone, '\D', '', 'g')
  END
  WHERE phone IS NOT NULL AND phone <> '';
END $$;
```

- [ ] **Step 5: Migratsiyani sinash**

```bash
cd apps/api && bun run drizzle:migrate
bun test --env-file=../../.env tests/integration/phone-normalization.test.ts
```
Ikkalasi ham muvaffaqiyatli.

- [ ] **Step 6: Regressiya — mavjud auth testlari**

Run: `cd apps/api && bun test --env-file=../../.env src/modules/auth/ src/modules/users/`
Kutiladi: PASS.

- [ ] **Step 7: Commit**

```bash
cd ../.. && bun run typecheck
git add apps/api/src/modules/auth/ apps/api/src/modules/users/ apps/api/src/routes/reset-owner-password.ts apps/api/drizzle/ apps/api/tests/integration/phone-normalization.test.ts
git commit -m "fix(auth): telefon raqami barcha kirish nuqtalarida kanonik shaklga keltiriladi"
```

---

## Task 10: Web — aktivatsiya sahifasi va `/register-tenant` ko'rinishi

**Files:**
- Modify: `apps/web/src/features/auth/pages/activate.page.tsx`
- Modify: `apps/web/src/features/auth/auth.routes.tsx`
- Modify: `apps/api/src/modules/auth/auth.routes.ts` (yangi `GET /registration-enabled`)
- Modify: `packages/i18n/src/uz.json`, `packages/i18n/src/ru.json`
- Test: `apps/web/src/features/auth/pages/activate.page.test.tsx` (yangi bo'lsa yarating)

**Interfaces:**
- Consumes: Task 8 javobi (`data.ownerPhone`).
- Produces: `GET /api/auth/registration-enabled` → `{ data: { enabled: boolean } }`.

- [ ] **Step 1: Backend endpoint (auth.routes.ts)**

`register-tenant` route'idan keyin, **`requirePermission`siz va authsiz** (CLI-154/155
precedenti — pre-auth sahifa uchun kerak):

```ts
  // Pre-auth: SPA `/register-tenant` havolasini ko'rsatish/yashirish uchun.
  // Desktop rejimida o'z-o'zini ro'yxatdan o'tkazish o'chirilgan
  // (`register-tenant` handleri allaqachon 403 qaytaradi) — bu endpoint faqat
  // UI foydalanuvchini bekorga formaga yubormasligi uchun.
  app.openapi(registrationEnabledRoute, async (c) =>
    c.json(ok({ enabled: process.env.DENTAL_LOCAL_DESKTOP !== 'true' })),
  );
```

`createRoute` — `method: 'get'`, `path: '/registration-enabled'`,
`operationId: 'registrationEnabled'`, javob schema
`apiResponseSchema(z.object({ enabled: z.boolean() }))`.

- [ ] **Step 2: Test (api)**

```ts
it("desktop rejimida ro'yxatdan o'tish o'chirilgan deb qaytaradi", async () => {
  process.env.DENTAL_LOCAL_DESKTOP = 'true';
  const res = await app.request('/api/auth/registration-enabled');
  expect((await res.json()).data.enabled).toBe(false);
});
```

Run: `cd apps/api && bun test --env-file=../../.env src/modules/auth/` → PASS

- [ ] **Step 3: OpenAPI klientni qayta generatsiya qilish**

```bash
bun run generate:openapi && bun run generate:api-client
```

- [ ] **Step 4: `activate.page.tsx` — login telefonini ko'rsatish**

`ActivateResponse` tipini kengaytiring:

```ts
type ActivateResponse =
  | { success: true; data: { modules: string[]; expiresAt: string; ownerPhone?: string } }
  | { success: false; error: { code: string; message: string } };
```

`success` holatini `ownerPhone` bilan saqlang va Alert'da ko'rsating:

```tsx
{success && (
  <Alert color="green" variant="light" mb="md">
    {t('auth.activate.success')}
    {ownerPhone && (
      <Text size="sm" mt="xs">
        {t('auth.activate.login_hint', { phone: ownerPhone })}
      </Text>
    )}
  </Alert>
)}
```

i18n kalitlari (`uz.json` / `ru.json`):

```json
"login_hint": "Kirish uchun telefon: {{phone}}. Parolni yetkazib beruvchidan oling."
"login_hint": "Телефон для входа: {{phone}}. Пароль получите у поставщика."
```

Yo'naltirish kechikishini `1500` → `4000` ms qiling — foydalanuvchi telefonni
o'qib ulgursin.

- [ ] **Step 5: `/register-tenant` route'ini shartli qilish**

`auth.routes.tsx` — `authRoutes` massivi statik qoladi, lekin
`RegisterTenantPage` ichida `registrationEnabled` false bo'lsa `/login`ga
`<Navigate replace>` qiling va yuklanayotganda `StateView` loading ko'rsating.
Sabab: route registry SPA yuklanishida sinxron kerak, endpoint javobi esa async.

- [ ] **Step 6: Web testlari**

```bash
cd apps/web && bunx vitest run src/features/auth/
```
Kutiladi: PASS.

- [ ] **Step 7: Commit**

```bash
cd ../.. && bun run typecheck
git add apps/api/src/modules/auth/ apps/web/src/features/auth/ packages/i18n/ packages/api-client/
git commit -m "feat(web): aktivatsiyadan keyin login telefonini ko'rsatish + desktopda ro'yxatdan o'tishni yashirish"
```

---

## Task 11: Supervisor admin — forma va hisob ma'lumotlari

**Files:**
- Modify: `apps/supervisor-admin/src/features/clinics/clinics.schema.ts`
- Modify: `apps/supervisor-admin/src/features/clinics/clinics.types.ts`
- Modify: `apps/supervisor-admin/src/features/clinics/components/CreateClinicModal.tsx`
- Modify: `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.tsx`
- Test: `apps/supervisor-admin/src/features/clinics/components/CreateClinicModal.test.tsx` (mavjud)
- Test: `apps/supervisor-admin/src/features/clinics/ClinicDetailPage.test.tsx` (mavjud)

**Interfaces:**
- Consumes: Task 4 javobi (`credentials: { loginPhone, tempPassword }`),
  `GET /:id` javobidagi `clinic.ownerTempPassword`.
- Produces: —

- [ ] **Step 1: Failing test (modal)**

```tsx
it('owner maydonlari majburiy', async () => {
  render(<CreateClinicModal opened onClose={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Yaratish' }));
  expect(await screen.findByText('Owner F.I.Sh. kiritilishi shart')).toBeInTheDocument();
});

it('yaratilgandan keyin login va vaqtinchalik parol ko\'rsatiladi', async () => {
  // createClinic mock: credentials: { loginPhone: '+998901234567', tempPassword: 'AbCdEfGh2345' }
  // ...forma to'ldiriladi va yuboriladi...
  expect(await screen.findByText('+998901234567')).toBeInTheDocument();
  expect(screen.getByText('AbCdEfGh2345')).toBeInTheDocument();
});
```

Run: `cd apps/supervisor-admin && bunx vitest run src/features/clinics/`
Kutiladi: FAIL.

- [ ] **Step 2: Schema kengaytirish**

```ts
export const createClinicFormSchema = z.object({
  name: z.string().min(1, 'Klinika nomi kiritilishi shart'),
  contactEmail: z.union([z.string().email("Email formati noto'g'ri"), z.literal('')]).optional(),
  contactPhone: z.string().optional(),
  plan: z.enum(['starter', 'standard', 'premium', 'enterprise'], { message: 'Tarifni tanlang' }),
  expiresAt: z.string().min(1, 'Amal qilish muddatini tanlang'),
  gracePeriodDays: z.number().int().min(1).max(365),
  ownerFullName: z.string().min(2, 'Owner F.I.Sh. kiritilishi shart'),
  ownerPhone: z.string().min(9, 'Owner telefoni kiritilishi shart'),
  defaultLanguage: z.enum(['uz', 'ru']),
  branchName: z.string().min(1, 'Filial nomi kiritilishi shart'),
  branchAddress: z.string().optional(),
  branchPhone: z.string().optional(),
});
```

`clinics.types.ts`ga: `CreateClinicInput`ga shu maydonlar; `Clinic`ga
`ownerFullName: string; ownerPhone: string`; `ClinicDetail.clinic`ga
`ownerTempPassword?: string | null`; `CreateClinicResult` tipi
`credentials: { loginPhone: string; tempPassword: string }` bilan.

- [ ] **Step 3: Modal maydonlari**

Mavjud maydonlardan keyin:

```tsx
<TextInput label="Owner F.I.Sh." {...form.getInputProps('ownerFullName')} />
<TextInput label="Owner telefoni" placeholder="+998 90 123 45 67" {...form.getInputProps('ownerPhone')} />
<Select label="Til" data={[{ value: 'uz', label: "O'zbekcha" }, { value: 'ru', label: 'Ruscha' }]} {...form.getInputProps('defaultLanguage')} />
<TextInput label="Filial nomi" {...form.getInputProps('branchName')} />
<TextInput label="Filial manzili" {...form.getInputProps('branchAddress')} />
<TextInput label="Filial telefoni" {...form.getInputProps('branchPhone')} />
```

`initialValues`ga: `ownerFullName: ''`, `ownerPhone: ''`, `defaultLanguage: 'uz'`,
`branchName: 'Bosh filial'`, `branchAddress: ''`, `branchPhone: ''`.

- [ ] **Step 4: Muvaffaqiyat kartasi**

Mavjud litsenziya kaliti blokidan keyin:

```tsx
<Text size="sm" fw={600} mt="md">
  Klinika kirish ma'lumotlari
</Text>
<Text size="sm" c="dimmed">
  Klinika aktivatsiya qilgach bu parol Supervisor bazasidan o'chiriladi — hozir
  nusxalab, mijozga yetkazing.
</Text>
<Code block>{created.credentials.loginPhone}</Code>
<Code block>{created.credentials.tempPassword}</Code>
<CopyButton value={`Login: ${created.credentials.loginPhone}\nParol: ${created.credentials.tempPassword}`}>
  {({ copied, copy }) => (
    <Button color={copied ? 'teal' : 'blue'} onClick={copy}>
      {copied ? 'Nusxalandi!' : "Kirish ma'lumotlarini nusxalash"}
    </Button>
  )}
</CopyButton>
```

- [ ] **Step 5: `ClinicDetailPage` holati**

Litsenziya bo'limiga:

```tsx
{clinic.ownerTempPassword ? (
  <Alert color="yellow" variant="light">
    Aktivatsiya kutilmoqda. Login: <b>{clinic.ownerPhone}</b>, vaqtinchalik parol:{' '}
    <Code>{clinic.ownerTempPassword}</Code>
  </Alert>
) : (
  <Alert color="green" variant="light">
    Aktivatsiya qilingan — vaqtinchalik parol o'chirilgan. Parol unutilsa
    "Parolni tiklash tokeni" tugmasidan foydalaning.
  </Alert>
)}
```

- [ ] **Step 6: Testlar → PASS**

Run: `cd apps/supervisor-admin && bunx vitest run src/features/clinics/`
Kutiladi: barcha testlar (mavjudlari ham) PASS.

- [ ] **Step 7: Commit**

```bash
cd ../.. && bun run typecheck
git add apps/supervisor-admin/src/features/clinics/
git commit -m "feat(supervisor-admin): owner maydonlari + kirish ma'lumotlari kartasi"
```

---

## Yakuniy tekshiruv (barcha tasklardan keyin)

- [ ] `bun run typecheck` — barcha paketlar toza
- [ ] `bun run check:rls` — RLS qamrovi buzilmagan
- [ ] `bunx biome check .` — 0 xato
- [ ] `cd apps/api && bun test --env-file=../../.env` — to'liq to'plam yashil
- [ ] `cd apps/supervisor-api && bun test` — yashil
- [ ] `cd packages/core && bun test` — yashil
- [ ] `cd apps/web && bunx vitest run` — yashil
- [ ] `cd apps/supervisor-admin && bunx vitest run` — yashil
- [ ] **Qo'lda E2E (Linux, `project_desktop_linux_run` retsepti):** toza baza →
      Supervisor'da klinika yaratish → desktop `/activate` → Supervisor bergan
      telefon+parol bilan login → tenant, filial va 8 rol shabloni mavjudligini
      tekshirish → Supervisor'da `owner_temp_password` NULL bo'lganini tasdiqlash
