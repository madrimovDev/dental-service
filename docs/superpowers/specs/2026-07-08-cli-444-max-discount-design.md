# CLI-444 — Kassa chegirmasi maksimal foizi (tenant-configurable limit)

**Sana:** 2026-07-08
**Ticket:** [CLI-444](https://linear.app/monro-delivery/issue/CLI-444)
**Status:** dizayn tasdiqlangan → implementatsiya

## Kontekst

CLI-444 audit topilmasi (2026-07-06, billing-flows-audit) ikki qismdan iborat edi:

1. **✅ ALLAQACHON BAJARILGAN** (commit `a285b18`, merge `9cbcd73`): erkin POS chegirma `itemsGross`dan katta bo'lganda jim `0`ga clamp o'rniga `DiscountExceedsTotalError` → 400 `cashier.discount_exceeds_total` bilan RAD etiladi. Test: `cli-444-discount-exceeds-total.test.ts`.

2. **⬜ SHU SPEC** — maksimal chegirma foizini cheklash (yuqori chegara). Hozir `cashier.create_transaction` egasi bo'lgan istalgan xodim `itemsGross` doirasida **istalgan** foiz chegirma (0–100%, ya'ni to'liq bepulgача) bera oladi.

## Biznes qarorlar (foydalanuvchi bilan kelishilgan)

- **Limit modeli:** tenant-configurable — har klinika o'z siyosatini belgilaydi (`tenant_settings.maxDiscountPercent`).
- **Default:** `100` (%) — cheklovsiz, backward-compatible. Mavjud tenantlar xulqi o'zgarmaydi.
- **Override:** YO'Q — qat'iy limit. Limitdan oshiq chegirmani hech kim (Owner ham) bera olmaydi. Yangi permission qo'shilmaydi.

## Kalit soddalik (invariant)

Default `maxDiscountPercent = 100` bo'lganda:

```
discountCents * 100 > itemsGrossCents * 100   ⟺   discountCents > itemsGrossCents
```

Ya'ni yangi chek default holatda **mavjud** `DiscountExceedsTotalError` cheki bilan **aynan bir xil** natija beradi → to'liq backward-compatible. Yangi cheklov faqat admin limitni pasaytirganda (masalan 30%) faollashadi.

## Dizayn

### 1. DB — `packages/db-schema/src/tables/tenant-settings.ts`

Yangi ustun:

```ts
maxDiscountPercent: integer('max_discount_percent').notNull().default(100),
```

- Oralig'i: 0–100 (validatsiya schema qatlamida, DB'da CHECK shart emas — mavjud pattern reminderLeadHours kabi).
- `drizzle-kit generate` → migration fayli → review → commit.

### 2. Backend enforcement — `apps/api/src/modules/cashier/cashier.service.ts::create`

Erkin POS rejimida (`resolvedItems.length > 0`), `discountCents` hisoblangandan keyin. **Tartib muhim** — mavjud `> itemsGross` cheki (247-qator) BIRINCHI qoladi, yangi `> maxPct%` cheki undan KEYIN:

```ts
// (mavjud, 247-qator — o'zgarmaydi):
if (resolvedItems.length > 0 && discountCents > itemsGrossCents) {
  throw new DiscountExceedsTotalError();          // → 400 cashier.discount_exceeds_total
}

// CLI-444 (yangi, mavjud chekdan keyin):
// tenant-configurable maksimal chegirma foizi (default 100 = cheklovsiz).
// Butun-son arifmetikasi — float yaxlitlashsiz aniq taqqoslash.
const maxPct = tenantSettings?.maxDiscountPercent ?? 100;
if (resolvedItems.length > 0 && discountCents * 100 > itemsGrossCents * maxPct) {
  throw new DiscountExceedsMaxError(maxPct);       // → 400 cashier.discount_exceeds_max
}
```

- **Tartib nega muhim:** default `maxPct=100` bo'lganda `discount > itemsGross` holati ikkala shartni ham qanoatlantiradi. Eski chek birinchi turgani uchun bu holatda `DiscountExceedsTotalError` (`cashier.discount_exceeds_total`) otiladi — mavjud `cli-444-discount-exceeds-total.test.ts` yashil qoladi. Yangi chek faqat `maxPct < 100` bo'lib, chegirma limitdan oshiq **lekin** `itemsGross` ichida bo'lganda otiladi.
- **Semantik farq:** `discount > 100%` (jami summadan katta) → `discount_exceeds_total`; `maxPct% < discount ≤ 100%` → `discount_exceeds_max`. Ikkalasi ham ma'noli, farqli xato.
- `tenant_settings` row RLS-scoped `getDb(c)` orqali o'qiladi; row yo'q bo'lsa (hali get-or-create qilinmagan) → default `100`.
- Plan-billing (allocations, `resolvedItems.length === 0`) rejimi ta'sirlanmaydi.

Yangi xato klassi (mavjud `DiscountExceedsTotalError` yonida):

```ts
export class DiscountExceedsMaxError extends Error {
  constructor(public readonly maxPercent: number) {
    super(`Discount exceeds max ${maxPercent}%`);
    this.name = 'DiscountExceedsMaxError';
  }
}
```

Routes qatlami (`cashier.routes.ts`) uni ushlaydi → 400 `cashier.discount_exceeds_max`.

### 3. tenant-settings modul

- **`tenant-settings.schema.ts`** — `UpdateSettingsInput`ga:
  ```ts
  maxDiscountPercent: z.coerce.number().int().min(0).max(100).optional(),
  ```
  va response `tenantSettingsDtoSchema`ga `maxDiscountPercent` qo'shish.
- **`tenant-settings.mapper.ts`** — DB row → DTO map'ga `maxDiscountPercent` qo'shish. `update()` service allaqachon `...rest` bilan patch qiladi, alohida o'zgarish shart emas.
- **`tenant-settings.mapper.test.ts`** — yangi maydonni qamrab olish.

### 4. Frontend Settings — `apps/web/src/features/settings/components/TenantSettingsScreen.tsx`

- `reminderLeadHours` maydoni yonida `maxDiscountPercent` `NumberInput` (0–100, `suffix="%"`, `clampBehavior`).
- `settings.schema.ts` form schema + `settings.mappers.ts` DTO↔view-model + `settings.types.ts` yangilanadi.
- i18n kalitlari (`packages/i18n/uz.json` + `ru.json`): label + hint (masalan "Maksimal chegirma foizi" / "Максимальный процент скидки").
- api-client regenerate (`generate:openapi` → `generate:api-client`) — DTO field frontend tipiga oqib o'tadi.

### 5. Testlar (TDD — avval failing test)

`apps/api/tests/integration/cli-444-max-discount.test.ts`:

| Holat | maxPct | discount | Kutilgan |
|---|---|---|---|
| Limitdan oshiq | 30 | 40% | 400 `cashier.discount_exceeds_max` |
| Limit ichida | 30 | 25% | 200 |
| Default cheklovsiz | 100 | itemsGross'gacha | 200 (backward-compat) |
| Aniq chegara | 30 | aynan 30% | 200 |

Mavjud `cli-444-discount-exceeds-total.test.ts` (3 test) o'zgarishsiz yashil qolishi kerak (regressiya yo'q).

## Qamrov tashqarisi (YAGNI)

- Override permission / Manager-approval — **yo'q** (qaror: qat'iy limit).
- Foizli chegirma UI'da vizual ko'rsatkich / real-time validatsiya frontend'da — MVP'da faqat backend enforcement + Settings maydoni; POS formasida server xatosi mavjud toast orqali ko'rsatiladi (CLI-165 global MutationCache).

## Verifikatsiya rejasi

- `bun test --env-file=../../.env` (api) — yangi + mavjud CLI-444 testlar yashil.
- `turbo typecheck` — 0 xato.
- `bun run check:rls` — tenant_settings allaqachon RLS-scoped, regressiya yo'q.
- Real HTTP repro: maxPct=30 tenant'da 40% chegirma → 400 (ticket'dagi asl repro teskarisi).
