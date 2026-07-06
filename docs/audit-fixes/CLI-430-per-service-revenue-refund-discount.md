# CLI-430 — byService / procedureMix refund + tranzaksiya-darajali chegirmani e'tiborsiz qoldiradi (shishirilgan daromad)

Audit: AUDIT-2026-07-06.md · M17.

---

## 1. Muammo va ildiz sabab

Ikki hisobot per-xizmat daromadni **item `subtotal` yig'indisidan** hisoblaydi va uni na
refund, na tranzaksiya-darajali chegirma bilan tuzatadi:

**byService** — `apps/api/src/modules/reports/reports.service.ts:139-157`:
```ts
const itemBase = [
  eq(cashierTransactions.status, 'completed'),
  eq(cashierTransactions.type, 'payment'),
  between(cashierTransactions.createdAt, start, end),
];
...
total: sql`COALESCE(SUM(${cashierTransactionItems.subtotal}), 0)`  // :149 — xom subtotal
```

**procedureMix** — `reports.service.ts:387-407` — bir xil pattern
(`SUM(cashierTransactionItems.subtotal)` + `SUM(quantity)`).

Ikki xatolik manbasi:

1. **Tranzaksiya-darajali chegirma e'tiborsiz.** `cashier_transactions.discount`
   (`packages/db-schema/src/tables/cashier.ts:52`, `numeric(14,2)`) butun tranzaksiyaga
   qo'llanadi; `cashier_transaction_items.subtotal` esa chegirmadan OLDINGI item narxi.
   Σ subtotal > haqiqiy olingan pul (`paidAmount`). `revenue.total` esa `signedPaidAmount`
   (`reports.service.ts:41`, ya'ni `paidAmount`) ishlatadi → **Σ byService > total** (audit
   M17 aynan shu nomuvofiqlikni belgilaydi).

2. **Refund e'tiborsiz.** Refund tranzaksiyalari **item'siz** (`cashier.service.ts:294-331`
   — refund tx faqat `treatment_stage_payments` negatsiyasi yozadi, `cashier_transaction_
   items` emas). Shuning uchun:
   - **To'liq refund:** original `status='voided'` (`cashier.service.ts:334-338`) →
     `itemBase` `status='completed'` filtri uni CHIQARADI → byService to'g'ri tushiradi.
     (Bu holat allaqachon qisman ishlaydi.)
   - **Qisman refund:** original `completed` qoladi → item'lar TO'LIQ sanaladi, qisman
     qaytarilgan summa ayrilmaydi → byService overstated.

Natijada per-xizmat daromad ham chegirma, ham qisman-refund miqdorida shishiriladi.

---

## 2. Dizayn qarori

**Tanlangan:** byService/procedureMix ni `revenue.total` bilan **bir xil naqd (cash)
bazasida** hisoblash — har payment tranzaksiya uchun **net-faktor** orqali item
subtotal'larini mutanosib kamaytirish.

Per-tranzaksiya net-faktor:
```
txGross  = Σ item.subtotal          (o'sha tx item'lari)
txNet    = tx.paidAmount − Σ (shu tx ga bog'langan refundlar.paidAmount)
factor   = txGross > 0 ? txNet / txGross : 0
perService_revenue = Σ round(item.subtotal × factor)
```

- **Chegirma:** `paidAmount = totalAmount` bo'lib, `totalAmount < Σ subtotal` (chegirma
  item narxlarini pasaytirmasdan tx-jami'dan ayirilgan) → `factor < 1` → chegirma har
  item'ga **mutanosib** taqsimlanadi. (Discount-allocation qoidasi = **item subtotal'iga
  proporsional**, chunki chegirma butun-tx darajasida va item-detalizatsiyasi yo'q — eng
  neytral, per-service adolatli taqsimot.)
- **Qisman refund:** parent payment tx ning bola refundlari (`parentTransactionId`,
  `type='refund'`) `txNet`'dan ayiriladi → o'sha xizmatga taalluqli daromad net'ga tushadi.
- **To'liq refund:** parent `voided` → allaqachon chiqariladi (o'zgarmaydi).
- **count (procedureMix):** protsedura SONI = xom `SUM(quantity)` qoladi (bajarilgan
  protsedura soni — refund pulni qaytaradi, lekin bajarilgan ishni "o'chirmaydi"). `revenue`
  esa net. To'liq refund holatida tx voided → count ham chiqariladi (izchil). Bu tanlov
  DTO izohida hujjatlashtiriladi ("count = bajarilgan, revenue = net collected").

**Nima uchun cash-basis (paidAmount), billed-basis (totalAmount) emas:** `revenue.total`
allaqachon `paidAmount` (cash). Per-service uni bilan izchil bo'lishi kerak
(`Σ byService ≈ total`). Aks holda ikki raqam bir dashboardda zid ko'rinadi.

**Rad etilgan alternativalar:**
- *Item jadvaliga `discount`/`refunded` ustunlari qo'shish* — schema o'zgarishi + har
  yozuvda taqsimlash mantig'i; hisobot vaqtida proporsional taqsimot yetarli va migratsiyasiz.
- *Chegirmani faqat birinchi/eng qimmat item'ga yozish* — per-service buzadi, adolatsiz.
- *Refundni umuman e'tiborsiz qoldirib faqat chegirmani tuzatish* — qisman refund teshigini
  qoldiradi (audit aniq talab qiladi).
- *byService ni `total`ga tenglashtirish uchun oddiy skalyar korreksiya (Σ subtotal / total
  nisbat)* — global skalyar per-service nisbatni buzadi (chegirma/refund tx-lokal, global
  emas).

---

## 3. Spec — xulq + edge cases + test case'lar

### Xulq
- byService[serviceName] = Σ (item.subtotal × txFactor) barcha completed payment tx bo'yicha.
- procedureMix[serviceName].revenue = xuddi shu net; `.count` = Σ quantity (xom).
- `Σ byService ≈ revenue.total` (kichik yaxlitlash farqidan tashqari; ideal holda teng —
  yaxlitlash uchun 4-bosqichga qarang).

### Edge cases
- **Chegirmasiz, refundsiz tx** — `factor = 1`, o'zgarmaydi (backward-compat).
- **To'liq refund (voided)** — allaqachon chiqariladi (factor hisoblanmaydi).
- **Qisman refund** — `factor < 1`, mutanosib kamaytirish.
- **`txGross = 0`** (item'siz payment — masalan plan-linked to'lov item'siz) — `factor = 0`
  → byService'ga hissa qo'shmaydi (item yo'q, xizmat qatori ham yo'q — to'g'ri; bunday pul
  `total`da `paidAmount` orqali qoladi, byService item-only surface).
- **Underpaid POS** (`paidAmount < totalAmount`, qarz) — `factor = paidAmount/Σsubtotal` →
  byService faqat olingan naqdni aks ettiradi (cash-basis izchil).
- **Yaxlitlash:** per-tx per-item round(2dp) → Σ byService `total`dan ±(item soni × 0.01)
  chetlashishi mumkin; talab qilinsa faqat aniqlik uchun, exact-match invariant SHART emas
  (test "net ≈ raw emas" tekshiradi, exact-total emas).

### Test case'lar (`apps/api/tests/integration/cli-430-per-service-net.test.ts`, real DB)
`cli-243-dental-analytics.test.ts` / `cli-244` seed patternidan.

- **T1 (audit ssenariysi — chegirma + to'liq refund):** itemli POS sale: item "Plomba"
  subtotal 1,000,000; `totalAmount = 900,000`, `discount = 100,000`, `paidAmount = 900,000`.
  (a) **Refundsiz:** `revenue().byService` "Plomba" = **900,000** (1,000,000 emas —
  chegirma net). (b) Keyin **to'liq refund** → sale voided → byService "Plomba" = **0**
  (yoki ro'yxatda yo'q); `dentalAnalytics().procedureMix` ham 0.
- **T2 (qisman refund):** item subtotal 1,000,000, discount 0, paidAmount 1,000,000; qisman
  refund 400,000 → byService "Plomba" = **600,000** (net), original completed qoladi.
- **T3 (izchillik):** aralash tx to'plami → `Σ byService.total` ≈ `revenue().total`
  (±yaxlitlash chegarasida).
- **T4 (procedureMix count vs revenue):** qisman refundli itemli sale → `procedureMix.count`
  = xom quantity (o'zgarmaydi), `procedureMix.revenue` = net.

---

## 4. Implementatsiya rejasi (TDD)

1. **Failing test:** `cli-430-per-service-net.test.ts` (T1–T4) → hozirgi kod xom subtotal
   qaytaradi → qizil.
2. **byService SQL refaktori (`reports.service.ts:139-157`):** per-tx net-faktorni SQL'da
   hisoblash. Yondashuv (bitta query, korrelyatsiyalangan/CTE):
   - Har payment tx uchun `txGross = SUM(items.subtotal)` (GROUP BY tx) va
     `refunded = COALESCE(SUM child refunds.paidAmount, 0)` (LEFT JOIN
     `cashier_transactions child ON child.parent_transaction_id = tx.id AND
     child.type='refund'` yoki subquery).
   - `factor = (tx.paidAmount − refunded) / NULLIF(txGross,0)`.
   - `byService = Σ round(item.subtotal * factor)` GROUP BY serviceName.
   - CTE bilan: `tx_net` (tx_id, factor) CTE → items JOIN tx_net → GROUP BY serviceName.
3. **procedureMix (`reports.service.ts:387-407`):** revenue uchun xuddi shu factor;
   `count` = `SUM(quantity)` xom qoldiriladi.
4. **Yaxlitlash:** minor-unit yoki `ROUND(SUM(subtotal*factor), 2)` — exact-total invariant
   talab qilinmaydi; DTO izohida "yaxlitlash bo'yicha kichik farq bo'lishi mumkin".
5. **Verify:** `cd apps/api && bun test --env-file=../../.env cli-430` + mavjud
   `cli-243-dental-analytics.test.ts` va reports testlari yashil (kutilgan qiymatlar
   yangilanishi mumkin — agar eski test xom subtotal kutayotgan bo'lsa, u refund/chegirma
   ishlatmagan seed'da o'zgarmaydi). `bun run typecheck`.

---

## 5. Migratsiya / rollout / xavflar
- **Migratsiya YO'Q** — faqat hisobot query mantig'i.
- **Backward-compat:** chegirmasiz/refundsiz ma'lumotda (ko'p demo/test seed) natija
  o'zgarmaydi (`factor=1`). Mavjud reports testlarini tekshirish — agar biror test
  chegirma/refundli seed bilan xom subtotal kutayotgan bo'lsa, kutilgan qiymat NET'ga
  yangilanadi (bu — bug fix, kutilgan o'zgarish).
- **Performance:** qo'shimcha JOIN/CTE (child refunds) — `cashier_tx_treatment_plan_idx`
  yo'q, lekin `parent_transaction_id` indeksi bor (V2-4 refund uchun,
  `cashier.ts` uniqueIndex/index). Hisobot oraliq-cheklangan → maqbul.
- **RLS:** o'zgarmaydi — barcha jadvallar tenant-scoped, `getDb(c)` orqali.

## 6. Qabul mezonlari
- [ ] T1a: chegirmali itemli sale → byService net (1M sale, 100k discount → 900k).
- [ ] T1b: to'liq refunddan keyin procedure-mix o'sha xizmatni net (0) aks ettiradi.
- [ ] T2: qisman refund → byService net (600k).
- [ ] T3: `Σ byService` ≈ `revenue.total` (yaxlitlash chegarasida).
- [ ] T4: procedureMix count = xom quantity, revenue = net.
- [ ] Mavjud reports/dental-analytics testlari yashil.

## 7. Ta'sirlangan fayllar
- `apps/api/src/modules/reports/reports.service.ts` — `revenue.byService` (139-157) va
  `dentalAnalytics.procedureMix` (387-407) net-faktor SQL.
- `apps/api/src/modules/reports/reports.schema.ts` — procedureMix/byService DTO izohi
  ("count = bajarilgan, revenue = net collected").
- `apps/api/tests/integration/cli-430-per-service-net.test.ts` — yangi test.
