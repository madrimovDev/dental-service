# CLI-423 — `adjustment` harakati faqat QO'SHADI; pastga tuzatishda phantom stock

> Audit: `AUDIT-2026-07-06.md` §M10. READ-ONLY spec — kod o'zgarmaydi, faqat reja.

## 1. Muammo va ildiz sabab (file:line)

`apps/api/src/modules/stock/stock.calc.ts:14-21` — `applyMovement`:

```ts
export function applyMovement(current, type, qty) {
  if (type === 'out') return current - qty;
  return current + qty; // in, adjustment (+)
}
```

`adjustment` `in` bilan bir xil ishlaydi — doim `current + qty`. Schema esa
(`apps/api/src/modules/stock/stock.schema.ts:24-29`) `quantity: z.coerce.number().positive()` —
manfiy yoki nol qiymatga ruxsat bermaydi. Natijada "Tuzatish/Korrektirovka" HARAKATI
faqat qoldiqni **oshiradi**, hech qachon kamaytira olmaydi.

**Ssenariy (audit):** hisobda 100, jismonan sanaganда 90 chiqdi. Foydalanuvchi farqni
"Tuzatish" bilan to'g'irlamoqchi bo'lib 10 kiritadi → `100 + 10 = 110` (phantom +20).
Pastga inventarizatsiya qilishning yo'li YO'Q.

`i18n` yorliqlari muammoni kuchaytiradi — mazmuni noaniq:
`packages/i18n/src/locales/uz.json:1250` `"adjustment": "Tuzatish"`,
`packages/i18n/src/locales/ru.json:1250` `"adjustment": "Корректировка"` — "tuzatish" so'zi
ikki yo'nalishni ham nazarda tutadi, lekin xulq faqat qo'shish.

Frontend: `apps/web/src/features/stock/components/MovementFormModal.tsx:73-78`
`NumberInput min={0}`, `apps/web/src/features/stock/stock.schema.ts:14-19` `positive()`.

## 2. Dizayn qarori

**Tanlangan: `adjustment` = SET-TO-VALUE (inventarizatsiya / stocktake semantikasi).**
Foydalanuvchi kiritadigan `quantity` — **aniqlangan (sanalgan) qoldiq** (absolyut qiymat,
`>= 0`). Yangi `stock_items.quantity` = kiritilgan qiymat. `stock_movements` qatorига esa
**imzoli delta** (`target − oldQty`) yoziladi — ledger haqiqiy o'zgarishni ko'rsatadi
(masalan 100→90 uchun `-10`).

**Nega bu:** klinikada eng ko'p uchraydigan holat — davriy inventarizatsiya (fizik sanoq),
u tabiiy ravishda "set-to-value". Delta hisoblash foydalanuvchiga qoladi bo'lsa (imzoli
delta modeli), xatolar ko'p bo'ladi va manfiy son kiritish UX'i noqulay.

**Rad etilган muqobil — imzoli delta (signed delta):** foydalanuvchi `-10` kiritadi,
`newQty = current + delta`. Rad etildi: (a) `NumberInput`da manfiy kiritish noqulay,
(b) inventarizatsiyada odam sanalgan sonni biladi, delta emas — qo'lда ayirish xato manbai,
(c) ticket to'g'ridan-to'g'ri set-to-value tavsiya qiladi.

**Saqlanadi:** qo'lда `out` uchun asimmetrik negative-stock guard (Qaror #31,
`stock.service.ts:198-200`) — o'zgarmaydi. `adjustment` set-to-value bo'lgani uchun
guard'ga kirmaydi (qiymat `>= 0` schema'да majburlanadi; adjustment hech qachon
`out` emas). Auto-deduction (`deductForServices`) guard'siz qoladi.

## 3. Spec — xulq + edge case'lar + test case'lar

### Xulq
- `type === 'in'`: `newQty = current + qty`, movement.quantity = `+qty`. (o'zgarmaydi)
- `type === 'out'`: `newQty = current − qty`, guard `newQty < 0` → `InsufficientStockError`;
  movement.quantity = `+qty`. (o'zgarmaydi)
- `type === 'adjustment'`: `qty` = **aniqlangan qoldiq (target)**. `newQty = qty`.
  movement.quantity = `qty − current` (imzoli delta, manfiy bo'lishi mumkin).
- Validatsiya: `in`/`out` → `quantity > 0`; `adjustment` → `quantity >= 0`
  (0 = "hech narsa qolmadi" — to'liq sarflangan holat qonuniy).

### Edge case'lar
- adjustment target = joriy qoldiq (o'zgarish yo'q): delta = 0; movement.quantity = `0` yoziladi
  (audit izi qoladi — kim, qachon sanaган). Qabul qilinadi.
- adjustment target = 0: qoldiq 0'ga tushadi; delta manfiy; low-stock alert transition
  bo'yicha ishlaydi (min > 0 bo'lsa).
- `stock_movements.quantity` `numeric(14,2)` NOT NULL — manfiy qiymatga DB ruxsat beradi
  (tasdiqlangan: `packages/db-schema/src/tables/stock-movements.ts:21`). Movement quantity
  hech qayерда SUM qilinmaydi (qoldiq yagona manba, Qaror #31) — manfiy qator xavfsiz.
- Low-stock alert (`maybeAlertLowStock`, `stock.service.ts:48-70`) transition-based
  (`old >= threshold && new < threshold`) — set-to-value pastга tushirsa to'g'ri ishlaydi.

### Test case'lar (pure — `stock.calc.test.ts`)
1. `applyMovement(100, 'adjustment', 90) === 90` (100→90, phantom emas — ticket'ning asosiy testi).
2. `applyMovement(100, 'adjustment', 110) === 110` (yuqoriга ham to'g'ri).
3. `applyMovement(100, 'adjustment', 0) === 0`.
4. `applyMovement(100, 'adjustment', 100) === 100` (o'zgarishsiz).
5. mavjud `in`/`out` case'lar o'zgarmaydi (regress; hozirgi 27-qatordagi
   `adjustment → qo'shadi` testi **yangilanadi** → set-to-value).
6. Yangi helper `adjustmentDelta(current, target)`: `adjustmentDelta(100, 90) === -10`,
   `adjustmentDelta(100, 110) === 10`.

### Test case'lar (integration — `ctx()` pattern, cli-242 uslubi)
7. adjustment 100→90: `createMovement({type:'adjustment', quantity:90})` → `stock_items.quantity = '90.00'`.
8. **Ledger tekshiruvi (yashirin bug):** shu movement qatorining `quantity = '-10.00'`
   (target emas, delta) — `listMovements` orqali.
9. adjustment target=0 low-threshold item: alert transition bir marta yuboriladi.

### Schema (`stock.schema.ts`)
`createMovementSchema` — `quantity` uchun tur-shartli validatsiya (`superRefine`):
```
type in {'in','out'} → quantity > 0
type === 'adjustment' → quantity >= 0
```
Web `movementFormSchema` (`apps/web/src/features/stock/stock.schema.ts:14-19`) — aynan mos ravishda.

### i18n (mazmun aniqlashtirish)
`type_label.adjustment` mazmuni "set-to-value inventarizatsiya" ekanini bildirsin:
- `uz.json:1250` → `"adjustment": "Inventarizatsiya"`
- `ru.json:1250` → `"adjustment": "Инвентаризация"`
- Qo'shimcha: `MovementFormModal`da `adjustment` tanlanganда `quantity` maydoni yorlig'i
  "Aniqlangan qoldiq" / "Фактический остаток" ko'rsatsin (yangi kalit `stock.counted_qty`).
  Ikkala fayl ham yangilanadi.

## 4. Implementatsiya rejasi (TDD)

1. **Failing test:** `stock.calc.test.ts`da yangi `adjustment` set-to-value case'lari (test #1-4)
   + `adjustmentDelta` case'lari (#6). Mavjud `adjustment → qo'shadi` testini set-to-value'ga
   yangilash. `cd apps/api && bun test stock.calc` → RED.
2. **Impl `stock.calc.ts`:** `applyMovement`da `if (type === 'adjustment') return qty;` shoxi;
   yangi `export function adjustmentDelta(current, target) { return target - current; }`.
   → GREEN.
3. **Failing integration:** `apps/api/tests/integration/cli-423-stock-adjustment.test.ts` —
   test #7-9 (`ctx()` pattern). `cd apps/api && bun test --env-file=../../.env cli-423` → RED
   (delta hali `+qty` yoziladi).
4. **Impl `stock.service.ts` `createMovement` (171-230):** movement insert'да
   `quantity: String(input.type === 'adjustment' ? adjustmentDelta(oldQty, input.quantity) : input.quantity)`.
   `newQuantity = applyMovement(...)` allaqachon to'g'ri (target). → GREEN.
5. **Schema:** `createMovementSchema` `superRefine` (api) + `movementFormSchema` (web).
   Typecheck.
6. **i18n:** `uz.json`/`ru.json` `adjustment` label + `stock.counted_qty` kaliti (ikkala fayl).
7. **Web:** `MovementFormModal` — `adjustment` tanlanganда quantity yorlig'i shartli
   (`stock.counted_qty`), NumberInput `min={0}` (o'zgarmaydi). Ixtiyoriy: adjustment tanlanganда
   `quantity` ni joriy qoldiq bilan prefill.
8. **Verify:** `bun test` (api) yashil; `bun run typecheck`; web build.

## 5. Migratsiya / rollout / xavflar
- DB migratsiya **kerak emas** — `stock_movements.quantity` allaqachon `numeric` (manfiy OK).
- Tarixdagi eski `adjustment` qatorlari (barchasi qo'shish semantikasi bilan yozilган) —
  o'zgartirilmaydi; retroaktiv migratsiya YO'Q. Faqat oldinга (fix-forward). Eski qatorlar
  `+` delta sifatida o'qiladi — tarixiy izoh sifatida to'g'ri qoladi.
- **Xavf:** foydalanuvchi eski aqliy modeli ("adjustment = qo'shish") bilan katta target
  kiritsa qoldiqni keskin oshirishi mumkin. i18n label o'zgarishi + "Aniqlangan qoldiq"
  yorlig'i buni yumshatadi.
- Movement.quantity manfiy bo'lishi — `MovementHistory.tsx` qatorда `-10.00` ko'rsatadi
  (mazmunli). Formatlash buzilmaydi (string). Ixtiyoriy polish: manfiyni qizil rangда.

## 6. Qabul mezonlari
- [ ] Inventarizatsiya 100→90: `createMovement(adjustment, 90)` → item.quantity = 90 (110 EMAS).
- [ ] Shu harakatning movement.quantity = `-10.00` (ledger delta to'g'ri).
- [ ] `adjustment` yuqoriга (100→110) va nolga (→0) ishlaydi.
- [ ] `in`/`out` xulqi va `out` negative guard o'zgarmagan (regress yashil).
- [ ] `quantity: 0` faqat `adjustment` uchun qabul qilinadi, `in`/`out` uchun rad.
- [ ] i18n label + counted-qty yorlig'i ikkala tilда.
- [ ] `bun test` + typecheck yashil.

## 7. Ta'sirlangan fayllar
- `apps/api/src/modules/stock/stock.calc.ts` — `applyMovement` adjustment shoxi + `adjustmentDelta`.
- `apps/api/src/modules/stock/stock.calc.test.ts` — case'lar yangilanadi.
- `apps/api/src/modules/stock/stock.service.ts` — `createMovement` movement.quantity delta.
- `apps/api/src/modules/stock/stock.schema.ts` — `createMovementSchema` superRefine.
- `apps/api/tests/integration/cli-423-stock-adjustment.test.ts` — YANGI.
- `apps/web/src/features/stock/stock.schema.ts` — `movementFormSchema` superRefine.
- `apps/web/src/features/stock/components/MovementFormModal.tsx` — shartli yorliq.
- `packages/i18n/src/locales/uz.json` + `ru.json` — label + `stock.counted_qty`.
