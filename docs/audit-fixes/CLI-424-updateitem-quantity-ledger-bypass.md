# CLI-424 — `updateItem` `quantity`ni to'g'ridan-to'g'ri o'zgartiradi; ledger + low-stock alert chetlab o'tiladi

> Audit: `AUDIT-2026-07-06.md` §M11. READ-ONLY spec — kod o'zgarmaydi, faqat reja.

## 1. Muammo va ildiz sabab (file:line)

`apps/api/src/modules/stock/stock.service.ts:139`:

```ts
if (input.quantity !== undefined) patch.quantity = String(input.quantity);
```

`updateItem` (128-158) PATCH `/items/{id}` orqali `stock_items.quantity`ni to'g'ridan-to'g'ri
o'rnatadi:
- **Ledger chetlanadi** — hech qanday `stock_movements` qatori yozilmaydi. Qaror #31
  ("quantity yagona manba, har o'zgarish movement orqali") buziladi. `createBatch`
  (363-412) va `createMovement` (171-230) doim movement yozadi — `updateItem` esa yo'q.
- **Low-stock alert chetlanadi** — `maybeAlertLowStock` (48-70) faqat `createMovement` /
  `deductForServices`da chaqiriladi. Alert transition-based (`old >= threshold && new < threshold`).
  `updateItem` orqali qoldiq threshold ostiga tushirilsa → alert YO'Q. Bundan-da yomoni:
  keyingi HAR movement ham alert bermaydi, chunki `old` allaqachon `< threshold`
  (transition qayta yuz bermaydi) → item "jim" past qoladi.

`updateItemSchema` (`stock.schema.ts:16`) = `createItemSchema.partial()` — `quantity`ni
o'z ichiga oladi (`stock.schema.ts:11`).

**Frontend holati (muhim):** `apps/web/src/features/stock/stock.api.ts`da faqat
`useCreateItem` bor — **`useUpdateItem` YO'Q**. `ItemFormModal.tsx` faqat yaratish uchun
(`title={t('stock.create_item')}`, doim `create.mutate`). Butun web/desktop kodbaza'да
PATCH `/items/{id}`ni chaqiruvchi **hech qanday sayt yo'q** (grep tasdiqlangan). Ya'ni
`quantity`ni payload'dan olib tashlash — **nol caller migratsiyasi**.

## 2. Dizayn qarori

**Tanlangan: `quantity`ni PATCH-item payload'dan BUTUNLAY olib tashlash.**
Qoldiq faqat movement (`createMovement` — `in`/`out`/`adjustment`) yoki batch qabul
(`createBatch`) orqali o'zgaradi. Bu Qaror #31 "yagona manba, movement-only" ni to'liq
qo'llaydi va CLI-423 bilan izchil (inventarizatsiya = `adjustment` set-to-value).
`updateItem` faqat metadata'ni tahrirlaydi: `name`, `unit`, `category`, `price`,
`branchId`, `minThreshold`.

**Nega bu, ledger orqali yo'naltirish emas:** `updateItem` qoldiqni movement orqali
o'tkazishга qayta yozish mumkin edi, lekin bu ikki yo'lni (movement va item-edit)
takrorlaydi va foydalanuvchiga chalkash. `createMovement`/`createBatch` allaqachon to'liq
va aniq mazmunli. Frontend'да caller yo'qligi olib tashlashni xavfsiz qiladi.

**Rad etilган muqobil — `quantity`ni saqlab, movement orqali yo'naltirish:**
`updateItem` ichида `quantity` o'zgarsa `createMovement(adjustment)` chaqirish. Rad etildi:
(a) ikki API yo'li bir amalни bajaradi (chalkashlik), (b) `updateItem` audit qatori
`stock_item updated` bo'ladi, movement esa alohida — ikki audit yozuvi bir amal uchun,
(c) hech qanday caller so'ramayapti — YAGNI.

## 3. Spec — xulq + edge case'lar + test case'lar

### Xulq
- `PATCH /items/{id}` faqat metadata patch qiladi: `name`, `unit`, `category`, `price`,
  `branchId`, `minThreshold`. `quantity` **qabul qilinmaydi** (Zod `.strip()` default —
  noma'lum kalit jim tashlanadi; qo'shimcha himoya sifatida schema'дan chiqariladi).
- Qoldiq o'zgartirish YAGONA yo'llari: `createMovement` (`in`/`out`/`adjustment`),
  `createBatch`. Har biri movement + alert bilan.

### Edge case'lar
- Eski client `quantity` yuborsa (api-client eskirmagan bo'lsa ham) → Zod strip →
  `stock_items.quantity` **o'zgarmaydi**. Xatolik EMAS (jim e'tiborsiz), buzilmaydi.
- `minThreshold` PATCH orqali oshirilsa mavjud qoldiq yangi threshold ostiga tushishi
  mumkin, lekin alert transition yuz bermaydi → **OUT-OF-SCOPE, alohida band** (bir sinf
  bug, ticket faqat `quantity` haqida — pastda "kelajak" sifatida qayd).

### Test case'lar (integration — `ctx()` pattern, cli-242 uslubi)
1. **Immutability:** item quantity=100 → `updateItem(id, {name:'X', quantity: 5})` →
   `stock_items.quantity` hali `'100.00'` (Zod strip / schema olib tashlangan; 5 e'tiborsiz).
2. **Metadata patch ishlaydi:** `updateItem(id, {name:'Yangi', minThreshold: 20})` →
   `name='Yangi'`, `minThreshold='20.00'`, `quantity` o'zgarmagan.
3. **Alert to'g'ri ishlashда davom etadi:** item quantity=100, threshold=10.
   `createMovement(out, 95)` → quantity=5 (<10) → alert transition bir marta yuboriladi
   (updateItem endi qoldiqqa aralashmagani uchun transition holati toza).
4. **Regress:** `createMovement`/`createBatch`/`deductForServices` xulqi o'zgarmagan.

### Schema (`stock.schema.ts`)
`updateItemSchema`ni `createItemSchema.partial()`dan → `createItemSchema.omit({ quantity: true }).partial()`ga.
`quantity` type'da yo'qoladi → `UpdateItemInput` `quantity`siz → service satri (139) o'chiriladi.

## 4. Implementatsiya rejasi (TDD)

1. **Failing test:** `apps/api/tests/integration/cli-424-item-quantity-immutable.test.ts` —
   test #1 (immutability), #2 (metadata), #3 (alert). `cd apps/api && bun test --env-file=../../.env cli-424`
   → RED (#1 hozir 5'ga tushiradi).
2. **Impl schema:** `updateItemSchema = createItemSchema.omit({ quantity: true }).partial()`.
3. **Impl service:** `stock.service.ts:139` (`if (input.quantity !== undefined) patch.quantity = ...`)
   satrini o'chirish. → GREEN.
4. **Verify caller yo'qligi:** grep `updateItem`/PATCH `/items` web+desktop — 0 (allaqachon
   tasdiqlangan). Frontend o'zgarishi KERAK EMAS.
5. **api-client regen:** `bun run generate:openapi && bun run generate:api-client` —
   `UpdateItemBody`dan `quantity` tushadi (generated tur yangilanadi). Typecheck.
6. **Verify:** `bun test` (api) yashil; typecheck 18/18; web build.

## 5. Migratsiya / rollout / xavflar
- DB migratsiya **kerak emas**.
- Frontend caller migratsiyasi **kerak emas** (0 caller).
- **Xavf: minimal.** Yagona xulq o'zgarishi — PATCH orqali qoldiq o'rnatishning "yashirin"
  yo'li yo'qoladi. Bu yo'l noto'g'ri edi (ledger buzardi), shuning uchun uni yo'qotish
  to'g'irlash. Agar biror admin skript PATCH bilan quantity o'rnatgan bo'lsa (ehtimoli past,
  UI yo'q) — u endi `createMovement(adjustment)`ga o'tishi kerak.
- api-client generated turi o'zgaradi (`quantity` optional'дan yo'q) — kompilyatsiya-vaqti
  kafolat: agar biror joy uni ishlatsa typecheck qizil beradi (hozir yo'q).

## 6. Qabul mezonlari
- [ ] `updateItem`ga `quantity` berilsa `stock_items.quantity` o'zgarmaydi (immutable).
- [ ] Metadata (`name`/`unit`/`category`/`price`/`branchId`/`minThreshold`) PATCH ishlaydi.
- [ ] Threshold ostiga movement bilan tushirilганда alert transition to'g'ri bir marta ishlaydi.
- [ ] `UpdateItemInput` turida `quantity` yo'q; generated `UpdateItemBody`dan tushган.
- [ ] `bun test` + typecheck yashil; web build yashil.

## 7. Ta'sirlangan fayllar
- `apps/api/src/modules/stock/stock.schema.ts` — `updateItemSchema` `omit({quantity})`.
- `apps/api/src/modules/stock/stock.service.ts` — 139-satr o'chiriladi.
- `apps/api/tests/integration/cli-424-item-quantity-immutable.test.ts` — YANGI.
- `packages/api-client/*` — regen (avtomatik).
- Frontend: o'zgarish YO'Q (caller mavjud emas).

---
### Kelajak (out-of-scope, alohida ticket kerak)
- **`minThreshold` PATCH orqali oshirish** — mavjud qoldiqni yangi threshold ostига
  tushirsa alert transition yuz bermaydi (aynan shu sinf bug). Yechim: `updateItem`da
  threshold o'zgarganда `isLowStock`ni qayta baholab, transition bo'lsa `maybeAlertLowStock`.
- **`createItem` boshlang'ich `quantity`** (`stock.service.ts:112`) ledger qatorisiz
  o'rnatiladi (`createBatch`dan farqli). Boshlang'ich qoldiq uchun "opening balance"
  movement yozish mumkin — hozir emas.
