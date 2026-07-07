# G6 — Mayda tozalash (CLI-453) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5 mustaqil mayda tozalash bandi (CLI-453) — i18n hardcode olib tashlash, CLI-419 backend regressiya testi, kassa schema guard kuchaytirish, pul arifmetikasi sentlarga ko'chirish (float-drift oldini olish), ombor low-stock alert'ni `minThreshold` PATCH'da ham trigger qilish. Har band mustaqil — istalgan tartibda bajarilishi mumkin, fayl-kesishuvi yo'q (band 4/5 ikkalasi `stock.service.ts`/`cashier.service.ts`ga tegadi, lekin bir-biriga bog'liq emas).

**Architecture:** Bandlar 5 xil fayl-guruhga tegadi: (1) frontend `DailySummaryCard.tsx` + `packages/i18n`, (2) yangi backend integration test (implementatsiya ALLAQACHON mavjud — `dailySummary` `paidAmount` bilan ishlaydi, faqat regressiya-testi yo'q edi), (3) `cashier.schema.ts` Zod `.refine`, (4) `cashier.service.ts::create` guard taqqoslashlari + yangi `toCents`/`fromCents` sof funksiyalar (`cashier.billing.ts`), (5) `stock.service.ts::updateItem` + `maybeAlertLowStock` refactor (bitta threshold-based transition tekshiruvidan ikkita eksplitsit `wasLow`/`isLow` boolean'ga — shu orqali "quantity o'zgardi" VA "threshold o'zgardi" ikkala stsenariy bir xil funksiya bilan qamrab olinadi, recipient-lookup+notify kodi dublikatsiyasiz).

**Tech Stack:** Bun, Hono, Drizzle ORM, PostgreSQL (RLS), Zod, React + Mantine + react-i18next, Vitest (frontend + pure-function unit), `bun test` (real-DB integration).

## Global Constraints

- Hech qanday `WHERE tenant_id` yozilmaydi — RLS (`getDb(c)`) filtrlaydi (CLAUDE.md §3.4).
- Pul summalari — `numeric(14,2)` DB ustunlari, JS'da `Number()` bilan o'qiladi (loyihada butun so'm invariant, CLI-117 qarori) — Band 4 faqat GUARD taqqoslashlarini sentlarga ko'chiradi, DB storage formati o'zgarmaydi.
- Integration testlar real DB (`bun test --env-file=../../.env`), `noopAudit` ishlatiladi (mock/spy audit YO'Q).
- i18n — har doim `t()` orqali, `uz.json`/`ru.json` ikkalasi birga yangilanadi (CLAUDE.md §3.9).
- Har band mustaqil commit — boshqa bandlarga bog'liqlik yo'q.

---

### Task 1: i18n — `cashier.cash_out` kaliti (`DailySummaryCard.tsx` hardcoded ternary)

**Files:**
- Modify: `packages/i18n/src/locales/uz.json:1087-1089`, `packages/i18n/src/locales/ru.json:1087-1089`
- Modify: `apps/web/src/features/cashier/components/DailySummaryCard.tsx:28-51`

**Interfaces:** Yo'q (yangi funksiya/tip yo'q — faqat matn manbai o'zgaradi, komponent props saqlanadi).

- [ ] **Step 1: i18n kalitlarini qo'shish**

`packages/i18n/src/locales/uz.json:1087-1089` — eski:

```json
    "cash_today": "Bugungi kassa",
    "total_revenue": "Jami tushum",
    "noop_fiscal": "Fiskal hujjat keyinroq Soliqqa yuboriladi",
```

yangi:

```json
    "cash_today": "Bugungi kassa",
    "total_revenue": "Jami tushum",
    "cash_out": "Naqd chiqim (refund)",
    "noop_fiscal": "Fiskal hujjat keyinroq Soliqqa yuboriladi",
```

`packages/i18n/src/locales/ru.json:1087-1089` — eski:

```json
    "cash_today": "Касса за сегодня",
    "total_revenue": "Общая выручка",
    "noop_fiscal": "Фискальный документ будет отправлен в налоговую позже",
```

yangi:

```json
    "cash_today": "Касса за сегодня",
    "total_revenue": "Общая выручка",
    "cash_out": "Возврат наличных (расход)",
    "noop_fiscal": "Фискальный документ будет отправлен в налоговую позже",
```

> Diqqat: uz qiymat aynan `"Naqd chiqim (refund)"` — mavjud `DailySummaryCard.test.tsx:52` (`expect(screen.getByText(/naqd chiqim/i)).toBeTruthy()`) shu matnga mos regex bilan qidiradi; qiymat o'zgarsa test buziladi.

- [ ] **Step 2: `DailySummaryCard.tsx` — ternary'ni `t()` bilan almashtirish**

`apps/web/src/features/cashier/components/DailySummaryCard.tsx:28-29` — eski:

```tsx
export function DailySummaryCard({ summary }: DailySummaryCardProps) {
  const { t, i18n } = useTranslation();
```

yangi:

```tsx
export function DailySummaryCard({ summary }: DailySummaryCardProps) {
  const { t } = useTranslation();
```

`apps/web/src/features/cashier/components/DailySummaryCard.tsx:48-51` — eski:

```tsx
  // TODO i18n key: cashier.cash_out (packages/i18n bu pass'da tegilmagan — handoff,
  // uz.json/ru.json'ga qo'shilishi kerak).
  const cashOutLabel =
    i18n.language === 'ru' ? 'Возврат наличных (расход)' : 'Naqd chiqim (refund)';
```

yangi:

```tsx
  // CLI-453 #1: hardcoded til-ternary o'rniga i18n kaliti (uz.json/ru.json qo'shildi).
  const cashOutLabel = t('cashier.cash_out');
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd apps/web && bunx vitest run src/features/cashier/components/DailySummaryCard.test.tsx`
Expected: PASS — barcha 5 test yashil (xususan `refund mavjud bo'lsa ko'rinadigan kassa-chiqim qatori ko'rsatiladi`, `/naqd chiqim/i` regex `t('cashier.cash_out')` natijasiga mos keladi).

- [ ] **Step 4: JSON validligini tekshirish**

Run: `cd packages/i18n && node -e "JSON.parse(require('fs').readFileSync('src/locales/uz.json')); JSON.parse(require('fs').readFileSync('src/locales/ru.json')); console.log('valid')"`
Expected: `valid` (sintaksis xatosiz).

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && bun run typecheck` (yoki repo-root `turbo run typecheck --filter=@dental/web`)
Expected: 0 xato (endi ishlatilmagan `i18n` destructure olib tashlangan — unused-var xato yo'q).

- [ ] **Step 6: Commit**

```bash
git add packages/i18n/src/locales/uz.json packages/i18n/src/locales/ru.json apps/web/src/features/cashier/components/DailySummaryCard.tsx
git commit -m "fix(web): CLI-453 #1 — cashier.cash_out i18n kaliti (hardcoded til-ternary o'rniga)"
```

---

### Task 2: CLI-419 backend regressiya testi (`dailySummary` — `paidAmount`, `totalAmount` emas)

**Kontekst:** `cashier.service.ts:432-466` (`dailySummary`) allaqachon `SUM(paidAmount)` ishlatadi (`:445` — CLI-419 izohi bilan, implementatsiya oldinroq qilingan). Bu band faqat **yetishmayotgan regressiya testini** yozadi — `docs/audit-fixes/CLI-419-daily-summary-counts-billed-not-received.md` §3'dagi T1/T2 stsenariylari.

**Files:**
- Test: yangi `apps/api/tests/integration/cli-419-daily-summary.test.ts`

**Interfaces:**
- Consumes: `createCashierService({audit, priceLookup}).create()`, `.refund()`, `.dailySummary(c, branchId, dateStr)` (mavjud, o'zgarmaydi).

- [ ] **Step 1: Write the test (allaqachon PASS bo'lishi kutiladi — implementatsiya mavjud, lekin TDD intizomi uchun avval qizil holatni simulyatsiya qiling: vaqtincha `cashier.service.ts:445`ni `totalAmount`ga qaytarib ko'ring, keyin qaytaring — ixtiyoriy tekshiruv)**

`apps/api/tests/integration/cli-419-daily-summary.test.ts`:

```ts
/**
 * CLI-419 — kunlik summary `paidAmount` (haqiqatda olingan naqd) bilan hisoblanadi,
 * `totalAmount` (hisob-faktura) EMAS. Implementatsiya `cashier.service.ts:445`da
 * allaqachon mavjud (CLI-419 izohi bilan) — bu test yetishmayotgan regressiya
 * qamrovini yopadi (spec: docs/audit-fixes/CLI-419-daily-summary-counts-billed-not-received.md).
 *
 * Ishga tushirish:
 *   cd apps/api && bun test tests/integration/cli-419-daily-summary.test.ts --env-file=../../.env
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { branches, patients, tenants, users } from '@dental/db-schema';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../src/db/client.ts';
import { db } from '../../src/db/client.ts';
import type { AuditLogger } from '../../src/lib/audit-logger.ts';
import { createCashierService } from '../../src/modules/cashier/cashier.service.ts';

const noopAudit = { record: async () => {} } as unknown as AuditLogger;

let tenantId: string;
let ownerId: string;
let branchId: string;
let patientId: string;

/** Asia/Tashkent kun-satri — `dailySummary` kun chegarasi bilan mos (cashier.service.ts:434-436). */
const tashkentToday = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());

beforeAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);

  const [owner] = await db
    .insert(users)
    .values({ phone: '+998900000419', passwordHash: 'fake', fullName: 'Owner' })
    .returning({ id: users.id });
  if (!owner) throw new Error('owner insert failed');
  ownerId = owner.id;

  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'CLI419 Clinic', slug: 'cli419-clinic', ownerUserId: ownerId })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('tenant insert failed');
  tenantId = tenant.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
    const [branch] = await tx
      .insert(branches)
      .values({ tenantId, name: 'Branch 1' })
      .returning({ id: branches.id });
    if (!branch) throw new Error('branch insert failed');
    branchId = branch.id;

    const [patient] = await tx
      .insert(patients)
      .values({ tenantId, fullName: 'Test Bemor' })
      .returning({ id: patients.id });
    if (!patient) throw new Error('patient insert failed');
    patientId = patient.id;
  });
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE users, tenants RESTART IDENTITY CASCADE`);
});

const ctx = (tx: DbOrTx): Context =>
  ({
    get: (k: string) =>
      k === 'db'
        ? tx
        : k === 'accessClaims'
          ? { perms: ['@owner'] }
          : k === 'activeTenantId'
            ? tenantId
            : k === 'user'
              ? { id: ownerId }
              : undefined,
  }) as unknown as Context;

describe('CLI-419: dailySummary — paidAmount (olingan naqd), totalAmount (hisob-faktura) EMAS', () => {
  test('T1 — kam to‘langan sotuv (paidAmount 800000 < totalAmount 1000000, cash) → breakdown.total === "800000"', async () => {
    const stubPriceLookup = { getActivePrice: async () => ({ price: '1000000' }) };
    const cashier = createCashierService({ audit: noopAudit, priceLookup: stubPriceLookup });

    const today = tashkentToday();

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx);

      await cashier.create(c, {
        branchId,
        patientId,
        items: [{ serviceId: crypto.randomUUID(), quantity: 1, unitPrice: 1000000, serviceName: 'X' }],
        discount: 0,
        paidAmount: 800000,
        paymentMethod: 'cash',
      } as never);

      const summary = await cashier.dailySummary(c, branchId, today);
      const cashPaymentRow = summary.breakdown.find(
        (b) => b.paymentMethod === 'cash' && b.type === 'payment',
      );
      expect(cashPaymentRow?.total).toBe('800000');
    });
  });

  test('T2 — refund kunida naqd-chiqim (type=refund) qatori paidAmount bilan ko‘rinadi', async () => {
    const stubPriceLookup = { getActivePrice: async () => ({ price: '500000' }) };
    const cashier = createCashierService({ audit: noopAudit, priceLookup: stubPriceLookup });

    const today = tashkentToday();

    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL app.current_tenant_id = '${tenantId}'`));
      const c = ctx(tx);

      const sale = await cashier.create(c, {
        branchId,
        patientId,
        items: [{ serviceId: crypto.randomUUID(), quantity: 1, unitPrice: 500000, serviceName: 'Y' }],
        discount: 0,
        paidAmount: 500000,
        paymentMethod: 'cash',
      } as never);

      const refundResult = await cashier.refund(c, sale.id, 500000);
      expect(refundResult.ok).toBe(true);

      const summary = await cashier.dailySummary(c, branchId, today);
      const refundRow = summary.breakdown.find(
        (b) => b.paymentMethod === 'cash' && b.type === 'refund',
      );
      expect(refundRow?.total).toBe('500000');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it passes (implementatsiya allaqachon to'g'ri)**

Run: `cd apps/api && bun test tests/integration/cli-419-daily-summary.test.ts --env-file=../../.env`
Expected: PASS — ikkala test yashil (implementatsiya mavjud, bu faqat regressiya-qamrov).

> Agar T1 FAIL bo'lsa (`total` `"1000000"` qaytarsa) — `cashier.service.ts:445` hali eski `SUM(totalAmount)` bilan (bu spec noto'g'ri taxmin qilgan bo'lishi mumkin). Bu holda avval `cashier.service.ts:445`ni tekshiring va kerak bo'lsa `SUM(${cashierTransactions.paidAmount})`ga o'zgartiring (implementatsiya qadam sifatida qo'shiladi, keyin testni qayta yurgizing).

- [ ] **Step 3: Typecheck**

Run: `cd apps/api && bun run typecheck`
Expected: 0 xato.

- [ ] **Step 4: Commit**

```bash
git add apps/api/tests/integration/cli-419-daily-summary.test.ts
git commit -m "test(api): CLI-453 #2 — dailySummary paidAmount regressiya testi (CLI-419 spec qamrovi)"
```

---

### Task 3: Schema guard — `items` VA `allocations` bir vaqtda to'ldirilgan bo'lsa RAD

**Files:**
- Modify: `apps/api/src/modules/cashier/cashier.schema.ts:33-37`
- Test: `apps/api/src/modules/cashier/cashier.schema.test.ts`

**Interfaces:** Yo'q (`createTransactionSchema` public shape saqlanadi, faqat qo'shimcha `.refine` sharti).

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/cashier/cashier.schema.test.ts` oxiriga (mavjud `describe('createTransactionSchema', ...)` blokining ichiga, oxirgi `it` dan keyin) qo'shing:

```ts
  it("items VA allocations ikkalasi ham to'ldirilgan — RAD etiladi (CLI-453 #3)", () => {
    const r = createTransactionSchema.safeParse({
      branchId,
      treatmentPlanId: '44444444-4444-4444-8444-444444444444',
      items: [{ serviceId, quantity: 1, unitPrice: 50000, serviceName: 'Konsultatsiya' }],
      allocations: [{ stageId, amount: 50000 }],
      paidAmount: 50000,
      paymentMethod: 'cash',
    });
    expect(r.success).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bunx vitest run src/modules/cashier/cashier.schema.test.ts`
Expected: FAIL — yangi test `r.success` `true` qaytaradi (joriy `.refine` faqat "ikkalasi ham bo'sh emas"ligini tekshiradi, "ikkalasi ham to'la"ligini rad etmaydi).

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/modules/cashier/cashier.schema.ts:33-37` — eski:

```ts
  // Erkin POS (items) yoki plan-billing (allocations) — kamida bittasi bo'lishi shart.
  .refine((v) => v.items.length > 0 || (v.allocations?.length ?? 0) > 0, {
    message: 'items yoki allocations talab qilinadi',
    path: ['items'],
  });
```

yangi:

```ts
  // Erkin POS (items) yoki plan-billing (allocations) — kamida bittasi bo'lishi shart.
  .refine((v) => v.items.length > 0 || (v.allocations?.length ?? 0) > 0, {
    message: 'items yoki allocations talab qilinadi',
    path: ['items'],
  })
  // CLI-453 #3: ikkalasi BIRGA to'ldirilishi taqiqlanadi — bitta tranzaksiya yo erkin
  // POS (items) YOKI plan-billing (allocations), aralash-rejim semantik jihatdan
  // noaniq (netTotal/allocation guard'lari bir-biriga mos kelmaydi).
  .refine((v) => !(v.items.length > 0 && (v.allocations?.length ?? 0) > 0), {
    message: 'items va allocations bir vaqtda to‘ldirilishi mumkin emas',
    path: ['allocations'],
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bunx vitest run src/modules/cashier/cashier.schema.test.ts`
Expected: PASS — barcha 4 test yashil (3 eski + 1 yangi).

- [ ] **Step 5: Typecheck**

Run: `cd apps/api && bun run typecheck`
Expected: 0 xato.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/cashier/cashier.schema.ts apps/api/src/modules/cashier/cashier.schema.test.ts
git commit -m "fix(api): CLI-453 #3 — createTransactionSchema items+allocations bir vaqtda RAD etadi"
```

---

### Task 4: Arifmetika izchilligi — kassa guard taqqoslashlari sentlarda

**Files:**
- Modify: `apps/api/src/modules/cashier/cashier.billing.ts` (yangi `toCents`/`fromCents` sof funksiyalar)
- Modify: `apps/api/src/modules/cashier/cashier.service.ts:14, 168-187` (`create()` guard'lari)
- Test: `apps/api/src/modules/cashier/cashier.billing.test.ts`

**Interfaces:**
- Produces: `toCents(amount: number): number`, `fromCents(cents: number): number` — eksport qilingan sof funksiyalar (`cashier.billing.ts`).
- Consumes: `cashier.service.ts::create` shu ikkalasini import qiladi.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/modules/cashier/cashier.billing.test.ts` fayliga (eng tepaga, mavjud `import`dan keyin, birinchi `describe`dan OLDIN) qo'shing:

```ts
import { fromCents, toCents } from './cashier.billing.ts';

describe('toCents / fromCents (CLI-453 #4 — sent-asosidagi arifmetika, distributeRefundNegations uslubi)', () => {
  it("butun so'm — round-trip aynan", () => {
    expect(toCents(100000)).toBe(10000000);
    expect(fromCents(10000000)).toBe(100000);
  });

  it('kasr summa (0.1) — sentga aylantirilganda butun son', () => {
    expect(toCents(0.1)).toBe(10);
    expect(fromCents(10)).toBe(0.1);
  });

  it("uch marta 33333.33 — sentlarda yig'indi aniq (9999999), float drift yo'q", () => {
    const cents = toCents(33333.33) * 3;
    expect(cents).toBe(9999999);
    expect(fromCents(cents)).toBe(99999.99);
  });

  it('0 — round-trip 0', () => {
    expect(toCents(0)).toBe(0);
    expect(fromCents(0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && bunx vitest run src/modules/cashier/cashier.billing.test.ts`
Expected: FAIL — `toCents`/`fromCents is not a function` (import xatosi, funksiyalar hali yo'q).

- [ ] **Step 3: Write minimal implementation — `cashier.billing.ts` yangi funksiyalar**

`apps/api/src/modules/cashier/cashier.billing.ts` faylining boshiga (mavjud faylning tepasidagi izohdan keyin, `distributeRefundNegations`dan OLDIN) qo'shing:

```ts
/**
 * CLI-453 #4: pul summasini sentlarga (butun songa) aylantiradi — `distributeRefundNegations`
 * bilan bir xil naqsh (Math.round(...×100)). Guard taqqoslashlar (itemsGross, netTotal,
 * allocSum) shu orqali float-drift'siz bajariladi (masalan 33333.33×3 kabi qayta-qayta
 * ko'paytirish/qo'shish natijasida JS float epsilon xatosi yig'ilishi mumkin edi).
 */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Sentlardan pul summasiga qaytarish — `toCents` ning teskarisi. */
export function fromCents(cents: number): number {
  return cents / 100;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && bunx vitest run src/modules/cashier/cashier.billing.test.ts`
Expected: PASS — barcha `distributeRefundNegations`/`computePlanBalance` (eski) + yangi `toCents`/`fromCents` testlar yashil.

- [ ] **Step 5: `cashier.service.ts::create` guard'larini sentlarga ko'chirish**

`apps/api/src/modules/cashier/cashier.service.ts:14` — eski:

```ts
import { computePlanBalance, distributeRefundNegations } from './cashier.billing.ts';
```

yangi:

```ts
import {
  computePlanBalance,
  distributeRefundNegations,
  fromCents,
  toCents,
} from './cashier.billing.ts';
```

`apps/api/src/modules/cashier/cashier.service.ts:168-187` — eski:

```ts
    const itemsGross = resolvedItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

    // CLI-444: discount itemsGross'dan katta bo'lsa jim clamp o'rniga RAD etiladi
    // (routes 400 `cashier.discount_exceeds_total`). Faqat erkin POS (items bor)
    // rejimida ma'noli — plan-billing (allocations) discount'dan mustaqil.
    if (resolvedItems.length > 0 && input.discount > itemsGross) {
      throw new DiscountExceedsTotalError();
    }

    // Erkin POS: jami − chegirma (endi manfiy bo'lmasligi kafolatlangan — yuqoridagi guard).
    // Plan-billing (items bo'sh): allocation = paidAmount.
    const netTotal = resolvedItems.length > 0 ? itemsGross - input.discount : input.paidAmount;

    // Allocation yig'indisi paidAmount'dan oshmasligi shart (qisman ruxsat, oshib ketish RAD).
    if (input.allocations && input.allocations.length > 0) {
      const allocSum = input.allocations.reduce((s, a) => s + a.amount, 0);
      if (allocSum > input.paidAmount) {
        throw new AllocationExceedError();
      }
    }
```

yangi:

```ts
    // CLI-453 #4: guard taqqoslashlari sentlarda (×100, butun son) — distributeRefundNegations
    // uslubi (cashier.billing.ts). Xulq o'zgarmaydi (butun so'm summalar uchun natija bir
    // xil), faqat kelajakdagi kasr-summa float-drift xavfi bartaraf etiladi.
    const itemsGrossCents = resolvedItems.reduce(
      (sum, i) => sum + toCents(i.unitPrice) * i.quantity,
      0,
    );
    const discountCents = toCents(input.discount);

    // CLI-444: discount itemsGross'dan katta bo'lsa jim clamp o'rniga RAD etiladi
    // (routes 400 `cashier.discount_exceeds_total`). Faqat erkin POS (items bor)
    // rejimida ma'noli — plan-billing (allocations) discount'dan mustaqil.
    if (resolvedItems.length > 0 && discountCents > itemsGrossCents) {
      throw new DiscountExceedsTotalError();
    }

    // Erkin POS: jami − chegirma (endi manfiy bo'lmasligi kafolatlangan — yuqoridagi guard).
    // Plan-billing (items bo'sh): allocation = paidAmount.
    const netTotalCents =
      resolvedItems.length > 0 ? itemsGrossCents - discountCents : toCents(input.paidAmount);
    const netTotal = fromCents(netTotalCents);

    // Allocation yig'indisi paidAmount'dan oshmasligi shart (qisman ruxsat, oshib ketish RAD).
    if (input.allocations && input.allocations.length > 0) {
      const allocSumCents = input.allocations.reduce((s, a) => s + toCents(a.amount), 0);
      if (allocSumCents > toCents(input.paidAmount)) {
        throw new AllocationExceedError();
      }
    }
```

> Diqqat: `netTotal` o'zgaruvchisi pastroqda (`:202` `totalAmount: String(netTotal)`, `:293` `after: { totalAmount: netTotal, ... }`) O'ZGARMAYDI — faqat hisoblash usuli (endi `fromCents(netTotalCents)`). Butun so'm summalar uchun (loyihaning asosiy invarianti, CLI-117) natija BIR XIL qoladi.

- [ ] **Step 6: Regression — mavjud cashier testlari**

Run: `cd apps/api && bunx vitest run src/modules/cashier/`
Expected: PASS (`cashier.schema.test.ts`, `cashier.billing.test.ts` — Task 3/4 bilan birga barchasi yashil).

Run: `cd apps/api && bun test tests/integration/cashier-list-daterange.test.ts tests/integration/cashier-plan-balance.test.ts tests/integration/cli-393-cashier-audit.test.ts --env-file=../../.env`
Expected: PASS — mavjud kassa integration testlari regressiyasiz (CLI-443/444 discount/allocation guard xulqi o'zgarmagan, faqat ichki hisoblash usuli).

- [ ] **Step 7: Typecheck**

Run: `cd apps/api && bun run typecheck`
Expected: 0 xato.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/cashier/cashier.billing.ts apps/api/src/modules/cashier/cashier.billing.test.ts apps/api/src/modules/cashier/cashier.service.ts
git commit -m "refactor(api): CLI-453 #4 — kassa guard taqqoslashlari sentlarda (float-drift oldini olish)"
```

---

### Task 5: Ombor low-stock alert — `updateItem` orqali `minThreshold` oshirilganda ham trigger

**Kontekst:** `maybeAlertLowStock` (`stock.service.ts:52-74`) hozir `oldQty`/`newQty` VA BITTA `item.minThreshold`ni solishtiradi ("chegaradan pastga o'tish" — miqdor o'zgarganda). `updateItem` (`:136-167`) faqat metadata (shu jumladan `minThreshold`)ni yangilaydi, `quantity`ga tegmaydi (CLI-424) — shuning uchun hozirgi funksiya signature'i bilan to'g'ridan-to'g'ri chaqirib bo'lmaydi (miqdor o'zgarmagani uchun "oldQty >= threshold && newQty < threshold" hech qachon true bo'lmaydi, threshold o'zgarishi hisobga olinmaydi). **Yechim:** `maybeAlertLowStock`ni ikkita eksplitsit `wasLow`/`isLow` boolean qabul qiladigan qilib refaktor qilish (chaqiruvchi `isLowStock()` bilan hisoblab beradi) — shunda "miqdor o'zgardi" (mavjud 3 chaqiruv joyi) VA "threshold o'zgardi" (yangi `updateItem` chaqiruvi) bir xil funksiya bilan ishlaydi, recipient-lookup+notify kodi bitta joyda qoladi.

**Files:**
- Modify: `apps/api/src/modules/stock/stock.service.ts:52-74` (`maybeAlertLowStock` signature), `:251` (`createMovement` chaqiruvi), `:368-371` (`deductForServices` chaqiruvi), `:459-465` (`reconcileForServices` chaqiruvi), `:136-167` (`updateItem` — yangi chaqiruv)
- Test: `apps/api/tests/integration/cli-242-stock-depth.test.ts` (mavjud fayl kengaytiriladi — tenant/branch/permission/item fixture allaqachon bor)

**Interfaces:** `maybeAlertLowStock` ichki (eksport qilinmaydi) — signature o'zgarishi faqat shu fayl ichidagi 4 chaqiruv joyiga ta'sir qiladi.

- [ ] **Step 1: Write the failing test**

`apps/api/tests/integration/cli-242-stock-depth.test.ts` oxiriga (mavjud `describe('Ombor chuqurligi — recipient + guard + alert + batch', ...)` blokining ichiga, oxirgi `test`dan keyin, yopuvchi `});` dan OLDIN) qo'shing — yangi mustaqil item (`freshItem`) yaratiladi, mavjud `itemId` holatiga (avvalgi testlar tomonidan o'zgartirilgan qoldiqqa) bog'liq bo'lmaslik uchun:

```ts
  test('CLI-453 #5: minThreshold PATCH orqali oshirilsa va joriy quantity yangi chegaradan past bo‘lsa — alert trigger', async () => {
    const freshItem = await withTx((tx) =>
      tx
        .insert(stockItems)
        .values({
          tenantId: t1,
          branchId,
          name: 'Gipsli material',
          unit: 'kg',
          quantity: '8',
          minThreshold: '5',
        })
        .returning({ id: stockItems.id })
        .then((r) => r[0]),
    );
    if (!freshItem) throw new Error('fresh item insert failed');

    const before = await withTx(lowStockCount);

    // minThreshold 5 → 10: 8 < 10 → YANGI transition (avval 8>=5 — past emas edi, endi 8<10 — past).
    await withTx((tx) => stock.updateItem(ctx(tx), freshItem.id, { minThreshold: 10 }));

    expect(await withTx(lowStockCount)).toBe(before + 2); // U1 + owner
  });

  test('CLI-453 #5: minThreshold qayta PATCH (10→10, o‘zgarishsiz) — YANGI alert YO‘Q', async () => {
    const item = await withTx((tx) =>
      tx
        .select({ id: stockItems.id })
        .from(stockItems)
        .where(eq(stockItems.name, 'Gipsli material'))
        .then((r) => r[0]),
    );
    if (!item) throw new Error('item not found');

    const before = await withTx(lowStockCount);
    await withTx((tx) => stock.updateItem(ctx(tx), item.id, { minThreshold: 10 }));
    expect(await withTx(lowStockCount)).toBe(before); // allaqachon 8<10 edi — YANGI transition emas
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test tests/integration/cli-242-stock-depth.test.ts --env-file=../../.env`
Expected: FAIL — birinchi yangi test `before` bilan bir xil qiymat qaytaradi (`updateItem` hozircha `maybeAlertLowStock`ni umuman chaqirmaydi — alert yo'q).

- [ ] **Step 3: Write minimal implementation — `maybeAlertLowStock` refaktor**

`apps/api/src/modules/stock/stock.service.ts:52-74` — eski:

```ts
  async function maybeAlertLowStock(
    c: Context,
    tx: DbOrTx,
    item: { id: string; name: string; branchId: string | null; minThreshold: string },
    oldQty: number,
    newQty: number,
  ) {
    if (!deps.notifications) return;
    const threshold = Number(item.minThreshold);
    // Faqat chegaradan PASTGA o'tganda (oldin >=, hozir <).
    if (!(oldQty >= threshold && newQty < threshold)) return;
    const tenantId = c.get('activeTenantId');
    if (!tenantId) return;
    const recipients = await findRecipientsWithPermission(c, 'stock.manage', item.branchId);
    for (const userId of recipients) {
      await deps.notifications.notifyInTx(tx, tenantId, {
        userId,
        type: 'stock.low_threshold',
        title: `Kam qoldiq: ${item.name}`,
        body: `Qoldiq: ${newQty} (min: ${threshold})`,
      });
    }
  }
```

yangi:

```ts
  /**
   * CLI-453 #5: `wasLow`/`isLow` — chaqiruvchi `isLowStock()` bilan oldindan hisoblab
   * beradi (qoldiq o'zgarganda ESKI/YANGI qoldiqni ESKI/YANGI threshold bilan, yoki
   * threshold o'zgarganda BIR XIL qoldiqni ESKI/YANGI threshold bilan). Shu orqali
   * bitta funksiya ikkala trigger-stsenariyni ("miqdor kamaydi" VA "chegara oshirildi")
   * qamrab oladi — recipient-lookup+notify kodi dublikatsiyasiz.
   */
  async function maybeAlertLowStock(
    c: Context,
    tx: DbOrTx,
    item: { id: string; name: string; branchId: string | null; minThreshold: string },
    wasLow: boolean,
    isLow: boolean,
    currentQty: number,
  ) {
    if (!deps.notifications) return;
    // Faqat YANGI transition (avval past emas edi, hozir past) — har chaqiruvda emas.
    if (!(!wasLow && isLow)) return;
    const tenantId = c.get('activeTenantId');
    if (!tenantId) return;
    const threshold = Number(item.minThreshold);
    const recipients = await findRecipientsWithPermission(c, 'stock.manage', item.branchId);
    for (const userId of recipients) {
      await deps.notifications.notifyInTx(tx, tenantId, {
        userId,
        type: 'stock.low_threshold',
        title: `Kam qoldiq: ${item.name}`,
        body: `Qoldiq: ${currentQty} (min: ${threshold})`,
      });
    }
  }
```

`apps/api/src/modules/stock/stock.service.ts:251` (`createMovement` ichida) — eski:

```ts
      await maybeAlertLowStock(c, tx, item, oldQty, newQuantity);
```

yangi:

```ts
      {
        const threshold = Number(item.minThreshold);
        await maybeAlertLowStock(
          c,
          tx,
          item,
          isLowStock(oldQty, threshold),
          isLowStock(newQuantity, threshold),
          newQuantity,
        );
      }
```

`apps/api/src/modules/stock/stock.service.ts:368-371` (`deductForServices` ichida) — eski:

```ts
        if (updated) {
          const newQty = Number(updated.quantity);
          await maybeAlertLowStock(c, db, updated, newQty + Number(bom.qtyPerService), newQty);
        }
```

yangi:

```ts
        if (updated) {
          const newQty = Number(updated.quantity);
          const oldQty = newQty + Number(bom.qtyPerService);
          const threshold = Number(updated.minThreshold);
          await maybeAlertLowStock(
            c,
            db,
            updated,
            isLowStock(oldQty, threshold),
            isLowStock(newQty, threshold),
            newQty,
          );
        }
```

`apps/api/src/modules/stock/stock.service.ts:459-465` (`reconcileForServices` ichida) — eski:

```ts
        if (updated) {
          const newQty = Number(updated.quantity);
          const oldQty = isDeduction
            ? newQty + Number(bom.qtyPerService)
            : newQty - Number(bom.qtyPerService);
          await maybeAlertLowStock(c, db, updated, oldQty, newQty);
        }
```

yangi:

```ts
        if (updated) {
          const newQty = Number(updated.quantity);
          const oldQty = isDeduction
            ? newQty + Number(bom.qtyPerService)
            : newQty - Number(bom.qtyPerService);
          const threshold = Number(updated.minThreshold);
          await maybeAlertLowStock(
            c,
            db,
            updated,
            isLowStock(oldQty, threshold),
            isLowStock(newQty, threshold),
            newQty,
          );
        }
```

`apps/api/src/modules/stock/stock.service.ts:136-167` (`updateItem`) — eski (funksiya oxiri):

```ts
  async function updateItem(c: Context, id: string, input: UpdateItemInput) {
    const db = getDb(c);
    const [before] = await db.select().from(stockItems).where(eq(stockItems.id, id));
    if (!before) return null;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.branchId !== undefined) patch.branchId = input.branchId;
    if (input.name !== undefined) patch.name = input.name;
    if (input.unit !== undefined) patch.unit = input.unit;
    if (input.category !== undefined) patch.category = input.category;
    if (input.price !== undefined) patch.price = input.price != null ? String(input.price) : null;
    // CLI-424: `quantity` PATCH orqali o'zgartirilmaydi (ledger chetlanmasin) — schema'dan
    // olib tashlangan (`UpdateItemInput`da yo'q). Qoldiq faqat movement/batch orqali.
    if (input.minThreshold !== undefined) patch.minThreshold = String(input.minThreshold);

    const [updated] = await db
      .update(stockItems)
      .set(patch)
      .where(eq(stockItems.id, id))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'stock_item',
        resourceId: id,
        before,
        after: updated,
      });
    }
    return updated;
  }
```

yangi:

```ts
  async function updateItem(c: Context, id: string, input: UpdateItemInput) {
    const db = getDb(c);
    const [before] = await db.select().from(stockItems).where(eq(stockItems.id, id));
    if (!before) return null;

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.branchId !== undefined) patch.branchId = input.branchId;
    if (input.name !== undefined) patch.name = input.name;
    if (input.unit !== undefined) patch.unit = input.unit;
    if (input.category !== undefined) patch.category = input.category;
    if (input.price !== undefined) patch.price = input.price != null ? String(input.price) : null;
    // CLI-424: `quantity` PATCH orqali o'zgartirilmaydi (ledger chetlanmasin) — schema'dan
    // olib tashlangan (`UpdateItemInput`da yo'q). Qoldiq faqat movement/batch orqali.
    if (input.minThreshold !== undefined) patch.minThreshold = String(input.minThreshold);

    const [updated] = await db
      .update(stockItems)
      .set(patch)
      .where(eq(stockItems.id, id))
      .returning();

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'stock_item',
        resourceId: id,
        before,
        after: updated,
      });

      // CLI-453 #5: `minThreshold` PATCH orqali o'zgarganda ham low-stock alert
      // trigger bo'lishi kerak (avval faqat `quantity` o'zgarganda — createMovement/
      // deductForServices/reconcileForServices — chaqirilardi). `quantity` o'zi
      // o'zgarmaydi (CLI-424) — shuning uchun `wasLow`/`isLow` ESKI/YANGI thresholdga
      // nisbatan BIR XIL qoldiq bilan hisoblanadi.
      if (input.minThreshold !== undefined) {
        const quantity = Number(before.quantity);
        const oldThreshold = Number(before.minThreshold);
        const newThreshold = Number(updated.minThreshold);
        await maybeAlertLowStock(
          c,
          db,
          updated,
          isLowStock(quantity, oldThreshold),
          isLowStock(quantity, newThreshold),
          quantity,
        );
      }
    }
    return updated;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test tests/integration/cli-242-stock-depth.test.ts --env-file=../../.env`
Expected: PASS — barcha testlar yashil (5 eski + 2 yangi CLI-453 #5).

- [ ] **Step 5: Regression — boshqa stock testlari**

Run: `cd apps/api && bun test tests/integration/cli-424-item-quantity-immutable.test.ts --env-file=../../.env`
Expected: PASS (`updateItem` `quantity`ni o'zgartirmasligi haligacha to'g'ri — bu band faqat alert-trigger qo'shdi, `quantity` patch-immutable xulqiga tegmadi).

Run: `cd apps/api && bunx vitest run src/modules/stock/`
Expected: PASS (`stock.calc.test.ts` — `isLowStock`/`applyMovement`/`adjustmentDelta` o'zgarishsiz).

- [ ] **Step 6: Typecheck**

Run: `cd apps/api && bun run typecheck`
Expected: 0 xato.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/stock/stock.service.ts apps/api/tests/integration/cli-242-stock-depth.test.ts
git commit -m "fix(api): CLI-453 #5 — stock.updateItem minThreshold oshirilganda low-stock alert trigger"
```

---

## Yakuniy DoD

- [ ] Band 1: `cashier.cash_out` i18n kaliti uz+ru da mavjud, `DailySummaryCard.tsx` hardcoded ternary yo'q, mavjud frontend testlar (5/5) yashil.
- [ ] Band 2: `cli-419-daily-summary.test.ts` — 2 test yashil (T1 kam to'langan sotuv, T2 refund kunlik-chiqim).
- [ ] Band 3: `createTransactionSchema` — `items`+`allocations` bir vaqtda RAD, 4 test yashil (3 eski + 1 yangi).
- [ ] Band 4: `toCents`/`fromCents` — 4 unit test yashil; `cashier.service.ts::create` guard'lari sentlarda; mavjud kassa testlari (unit + integration) regressiyasiz.
- [ ] Band 5: `maybeAlertLowStock` — `wasLow`/`isLow` boolean-based; `updateItem` minThreshold-oshirilganda alert trigger, 2 yangi test yashil; mavjud stock testlari regressiyasiz.
- [ ] Har band — mustaqil commit, typecheck toza.
- [ ] Linear CLI-453 — "Done"ga o'tkaziladi (barcha 5 band implementatsiya + verify-agentdan keyin).
