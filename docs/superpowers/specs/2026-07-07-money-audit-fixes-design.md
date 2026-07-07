# Pul-modullari audit fixlari (2026-07-07) — Dizayn / Spec

> **Sana:** 2026-07-07
> **Linear:** CLI-448, CLI-449, CLI-450, CLI-451, CLI-452, CLI-453 (label `audit-2026-07-07`) + CLI-446 (mavjud, Variant A shu spec orqali yopiladi)
> **Kelib chiqishi:** 2026-07-07 "loyihadagi pul bilan bog'liq barcha qismini tahlil qil" so'rovi — 5 parallel Explore agent (kassa/billing, davolash rejasi, payroll, ombor/BOM, fiscal/hisobot) kod-darajasida tekshiruvi. 2026-07-06 audit (CLI-405..446) fixlari koddan tasdiqlandi; quyidagi 6 topilma yangi.
> **Scope:** 6 mustaqil ish guruhi (G1-G6), fayl-kesishuv bo'yicha guruhlangan. Har biri alohida worktree'da implementatsiya qilinadi (loyihaning o'rnatilgan pattern'i — CLI-443/444/445/446 roundiga qarang).

---

## 0. Tasdiqlangan biznes qarorlar (brainstorm sessiyasida)

| # | Savol | Qaror |
|---|---|---|
| 1 | CLI-451: `paidAmount > netTotal` bo'lsa server nima qiladi? | **Ruxsat beriladi, ortiqcha summa kredit sifatida balansga kiradi.** Qo'shimcha server-guard qo'shilmaydi. |
| 2 | CLI-449: fiscal chek summasi va vaqti | **`paidAmount` bilan, darhol (har to'lovda, qisman bo'lsa ham).** |
| 3 | CLI-446: finalizatsiyadan keyingi refund | **Variant A — `payroll_adjustments` carry-forward jadvali**, keyingi run avtomatik qo'llaydi. |
| 4 | CLI-450 (margin hisoboti) va CLI-452 (expense integratsiyasi) — bu safar quriladimi? | **Ikkalasi ham quriladi.** |
| 5 | **Yangi, dizayn paytida chiqqan:** CLI-448 — to'liq refund qilingan erkin POS savdoning qarzi qanday hisoblanadi? | **To'liq refund = savdo bekor qilingan** (ham `totalAmount`, ham `paidAmount` qarz hisobidan chiqadi). Qisman refundda naqd-asosidagi formula ishlatiladi (pastga qarang, G1). |

---

## G1 — Balans formulasi (CLI-448 + CLI-451)

**Fayllar:** `apps/api/src/modules/patients/patients.service.ts` (list balans `:130-149`, `balanceFor` `:197-216`), yangi/o'zgargan integration test, `apps/web/src/features/patients/components/BalanceChip.tsx` (+ uni ishlatuvchi `PatientCard.tsx`/`PatientsListScreen.tsx`).

**Joriy holat (bug):** Non-plan (`treatmentPlanId IS NULL`) qarz — `SUM(totalAmount - paidAmount) WHERE type='payment'`. `type='refund'` qatorlar butunlay chiqarib tashlangan.

**Yangi formula (per-original-tranzaksiya, CLI-430 `netServiceAggregates` uslubidagi correlated subquery):**

Har bir non-plan `type='payment'` qatori uchun:
```
refundedSum = COALESCE(SUM(refund.paidAmount) WHERE refund.parentTransactionId = original.id AND refund.type='refund'), 0)

agar refundedSum >= original.paidAmount:
    debtContribution = 0                                  -- to'liq refund = bekor qilingan savdo
aks holda:
    debtContribution = original.totalAmount - (original.paidAmount - refundedSum)
```

Umumiy non-plan qarz (yoki kredit, manfiy bo'lsa) = `SUM(debtContribution)` shu bemorning barcha non-plan `type='payment'` qatorlari bo'yicha.

**Tekshirish misollari (DoD uchun ham ishlatiladi):**
- To'liq to'langan, refundsiz: totalAmount=100, paidAmount=100 → hissasi 0.
- Qisman to'langan, refundsiz: totalAmount=100, paidAmount=60 → hissasi 40 (qarz).
- To'liq to'langan, TO'LIQ refund qilingan: totalAmount=100, paidAmount=100, refund=100 → hissasi **0** (avvalgi holatda ham 0 edi, o'zgarish yo'q — lekin endi to'g'ri sabab bilan: bekor qilingan, "refund chiqarib tashlangani uchun" emas).
- Qisman to'langan (60/100), TO'LIQ refund qilingan (60): refundedSum(60) >= paidAmount(60) → hissasi **0** (avval: 40 — bug tuzatiladi).
- Qisman to'langan (100/100), QISMAN refund qilingan (30): refundedSum(30) < paidAmount(100) → hissasi = 100-(100-30) = **30** (avval: 0 — bug tuzatiladi, klinika 30 qaytargani uchun endi 30 qarzdor sifatida ko'rinadi).
- Overpay (CLI-451): totalAmount=100, paidAmount=120, refundsiz → hissasi = 100-120 = **-20** (kredit).

**Implementatsiya:** `patients.service.ts` ikkala query (list + `balanceFor`) uchun raw-SQL CTE/correlated-subquery, `netServiceAggregates` (`reports.service.ts:83-129`) namunasi asosida — parametrlashgan, Date-interpolatsiya xatosi (CLI-430/441 darsi) qaytarilmasin.

**Frontend:** balans-ko'rsatish komponentini grep qilib topish, manfiy qiymat "kredit: X so'm" deb aniq label bilan (hozirgi "qarz: -X" chalkash ko'rinishini oldini olish uchun) ko'rsatilishini ta'minlash yoki tasdiqlash (agar allaqachon to'g'ri bo'lsa — o'zgartirilmaydi).

**Test:** `patients.balance.test.ts`ga yuqoridagi 6 stsenariy (real DB, `noopAudit`).

---

## G2 — Fiscal chek summasi (CLI-449)

**Fayl:** `apps/api/src/modules/cashier/cashier.service.ts:273-277`.

**O'zgarish:** `fiscal.createReceipt({ amount: Number(transaction.totalAmount), ... })` → `amount: Number(transaction.paidAmount)`. Chaqiruv joyi/vaqti (tranzaksiya yaratilishi bilan darhol) o'zgarmaydi — qaror #2 buni tasdiqladi.

**Ta'sir:** Hozircha `NoOpFiscalProvider` (`packages/fiscal`) — runtime xulq o'zgarmaydi, faqat kelajakdagi real integratsiyaga tayyorgarlik.

**Test:** `packages/fiscal/index.test.ts` yoki `cashier.billing.test.ts`ga bitta unit test — `paidAmount != totalAmount` holatida `createReceipt` chaqiruviga `paidAmount` uzatilganini tasdiqlaydi (mock/spy fiscal provider bilan).

---

## G3 — Payroll refund reconciliation, Variant A (CLI-446 3-qism)

**Yangi jadval:** `payroll_adjustments` (`packages/db-schema/src/tables/payroll.ts` yoki alohida fayl):
```
id UUID PK
tenantId UUID NOT NULL (RLS)
branchId UUID NOT NULL
doctorId UUID NOT NULL (users.id)
sourceTransactionId UUID NOT NULL REFERENCES cashier_transactions(id)   -- refund tranzaksiyasi
amount NUMERIC(14,2) NOT NULL                                          -- manfiy komissiya-ekvivalenti tuzatish
appliedToRunId UUID NULL REFERENCES payroll_runs(id)                    -- qo'llanganda to'ldiriladi
createdAt TIMESTAMPTZ NOT NULL DEFAULT now()
```
RLS: `FORCE ROW LEVEL SECURITY`, boshqa tenant-scoped jadvallar bilan bir xil policy naqshi. Migratsiya: `drizzle-kit generate` + review.

**Trigger — qachon adjustment yaratiladi:** Refund (`cashier.service.ts::refund`) muvaffaqiyatli bo'lgach, agar refund qilinayotgan asl tranzaksiyaning davri (createdAt) shu doctor uchun **finalized** (`payroll_runs.status='finalized'`) payroll run diapazoniga tushsa — yangi `payroll_adjustments` qatori yoziladi: `amount = -(refundAmount × asl finalized run'dagi payroll_line.commissionPercent)` (aniqlik uchun joriy profil foizi emas, o'sha davrdagi snapshot foiz ishlatiladi — `payroll_lines`dan lookup).

**Qo'llanish — keyingi run:** `createRun()` (`payroll.service.ts`) komissiya hisoblashdan keyin, shu doctor uchun `appliedToRunId IS NULL` bo'lgan barcha `payroll_adjustments`ni yig'ib, `computePayrollLine` natijasiga qo'shadi (floor 0 saqlanadi — `payroll.calc.ts:19-22` mavjud logika o'zgarmaydi, faqat kirish summasi adjustment bilan kattalashadi/kichraydi). `finalizeRun()` muvaffaqiyatli bo'lgach, qo'llangan adjustment qatorlariga `appliedToRunId = run.id` yoziladi (bitta tranzaksiyada, run finalize bilan atomik).

**Nima uchun faqat `finalized`:** `draft` run hali qulflanmagan — mavjud `deleteRun`/`createRun` orqali qo'lda o'chirib qayta yaratish mumkin (refund shu bilan tabiiy hisobga olinadi). Faqat `finalized` (immutable) run uchun adjustment mexanizmi kerak.

**Chetga chiqadigan holatlar (spec asl hujjatidagi ochiq savollar, endi hal qilingan):**
- Qoplanmagan adjustment qoldig'i (agar floor 0 tufayli to'liq qo'llanolmasa) — **keyingi-keyingi run'ga ko'chadi** (`appliedToRunId` bo'sh qoladi, keyingi safar yana kandidat sifatida tanlanadi).
- Doktor tenant'dan chiqib ketgan bo'lsa — adjustment baribir yaratiladi va saqlanadi (egasiz qolmaydi, keyingi run mavjud bo'lmagan doctorId'ni tabiiy ravishda o'tkazib yuboradi — `payroll.service.ts:104-127`dagi eligible-profil logikasi allaqachon shunday ishlaydi).

**Test (TDD):** (1) refund finalized davrga tushsa → adjustment yaratiladi; (2) keyingi run finalize → adjustment qo'llanadi, komissiya kamayadi (floor 0 saqlanadi); (3) adjustment ikki marta qo'llanmaydi; (4) qoplanmagan qoldiq keyingi-keyingi run'ga ko'chadi.

---

## G4 — Xizmat margin hisoboti (CLI-450)

**Fayllar:** `apps/api/src/modules/reports/reports.aggregations.ts`, `reports.service.ts`, `reports.schema.ts` (yangi maydon), frontend reports sahifasi.

**Xarajat hisoblash usuli (v1 approksimatsiya — aniq belgilanadi, keyinchalik aniqlashtirilishi mumkin):** `costPerUnit` faqat `stock_batches` jadvalida bor (`packages/db-schema/src/tables/stock-batches.ts:27`), FIFO/batch-darajasidagi sarf-tracking mavjud emas (`deductForServices` faqat item-darajasidagi quantity'ni kamaytiradi, muayyan batch bilan bog'lamaydi). Shuning uchun material narxi = **shu item uchun barcha `stock_batches.costPerUnit IS NOT NULL` qatorlarning oddiy o'rtachasi** (og'irliksiz average, sana bo'yicha weighting yo'q). Agar itemning hech qanday batch'ida cost yozilmagan bo'lsa — narxi 0 deb hisoblanadi (dokumentlashtirilgan cheklov, aniq COGS emas).

**Formula:**
```
materialCostPerService = SUM over BOM(service) of (qtyPerService × avgCostPerUnit(item))
margin = revenue (CLI-430 net, netServiceAggregates) - materialCostPerService
marginPct = margin / revenue (revenue=0 bo'lsa null)
```

**Endpoint/response:** `reports.aggregations.ts`dagi `procedureMix` javobiga `materialCost`, `margin`, `marginPct` maydonlari qo'shiladi (mavjud `byService`/`procedureMix` strukturasini kengaytiradi, yangi endpoint shart emas).

**Frontend:** reports sahifasida mavjud xizmat-bo'yicha jadvalga 3 ustun qo'shiladi (Material xarajati / Margin / Margin %).

**Test:** `reports.aggregations.test.ts`ga yangi stsenariy — BOM+batch cost fixture bilan margin hisobini tasdiqlaydi.

---

## G5 — Expense integratsiyasi (CLI-452)

**Fayllar:** `apps/api/src/modules/cashier/cashier.service.ts` (`dailySummary`), `apps/api/src/modules/reports/reports.service.ts`, `apps/web/src/features/cashier/components/DailySummaryCard.tsx`.

**O'zgarish:** `dailySummary(c, branchId, dateStr)` va tegishli reports revenue endpointi shu davr+filial uchun `expensesTotal = SUM(expenses.amount)` hisoblab qo'shadi, `netCashFlow = revenue - expensesTotal` qaytaradi.

**Ruxsat (permission) qarori:** Bu maydonlar **faqat so'rovchi foydalanuvchida `expense.view` bo'lsa** javobga qo'shiladi (`requirePermission`/`c.get('permissions')` tekshiruvi orqali, mavjud endpoint permission'iga qo'shimcha talab EMAS — shunchaki maydonni shartli qo'shish). Aks holda `expensesTotal`/`netCashFlow` javobda umuman bo'lmaydi (frontend shu holatda faqat mavjud kirim-qatorlarni ko'rsatadi, xatoga chiqmaydi).

**Frontend:** `DailySummaryCard.tsx`ga "Xarajat" va "Sof oqim" qatorlari — faqat backend javobida maydon mavjud bo'lsa ko'rinadi.

**Test:** backend integration test — `expense.view`li va `expense.view`siz foydalanuvchi uchun javobni solishtiradi.

---

## G6 — Mayda tozalash (CLI-453, 5 band)

1. **i18n:** `packages/i18n/src/locales/uz.json` va `ru.json`ga `cashier.cash_out` kaliti qo'shiladi; `DailySummaryCard.tsx:48-51`dagi `i18n.language === 'ru' ? ... : ...` ternary `t('cashier.cash_out')`ga almashtiriladi.
2. **CLI-419 backend test:** `apps/api/tests/integration/cli-419-daily-summary.test.ts` yoziladi — T1 (underpaid-sale: `paidAmount` hisobga olinadi, `totalAmount` emas), T2 (refund kunlik hisobotda chiqim/manfiy qator sifatida ko'rinadi). Asl spec (`docs/audit-fixes/CLI-419-*.md`) talabiga mos.
3. **Schema guard:** `cashier.schema.ts::createTransactionSchema` — `.refine`ga qo'shimcha shart: `items` va `allocations` ikkalasi ham bir vaqtda to'ldirilgan bo'lsa RAD etiladi (hozirgi "ikkalasi ham bo'sh bo'lmasin" shartiga qo'shimcha, uni almashtirmaydi).
4. **Arifmetika izchilligi:** `cashier.service.ts`dagi guard taqqoslashlar (`itemsGross`, `netTotal`, `allocSum` va h.k.) `distributeRefundNegations` (`cashier.billing.ts`) uslubiga — sentlarda (×100, butun son) ko'chiriladi, keyin natija qaytarishda /100 qilinadi. Xulq o'zgarmaydi (butun so'm summalar uchun natija bir xil), faqat kelajakdagi kasr-summa xavfi bartaraf etiladi.
5. **Stock alert retrigger:** `stock.service.ts` — `updateItem`da `minThreshold` PATCH orqali oshirilsa va joriy `quantity` yangi chegaradan past bo'lsa, mavjud low-stock alert funksiyasi (`findRecipientsWithPermission` + bildirishnoma, V2-2 qaroridagi kabi) shu yerda ham chaqiriladi (hozir faqat `quantity` o'zgarganda chaqiriladi).

**Test:** har band uchun mavjud test faylining kengaytmasi (yangi fayl shart emas, band-4 bundan mustasno — bu refactor, xulq o'zgarmasligini tasdiqlovchi regressiya sifatida mavjud `stock.calc.test.ts`/`cashier.billing.test.ts` yetarli).

---

## Umumiy DoD

- [ ] G1: 6 stsenariy test (yuqoridagi jadval) + frontend kredit-label tekshiruvi.
- [ ] G2: fiscal `paidAmount` bilan chaqiriladi, unit test.
- [ ] G3: `payroll_adjustments` migratsiya + create/apply/carry-forward TDD (4 test).
- [ ] G4: margin hisoboti `procedureMix`da, test bilan.
- [ ] G5: `expense.view`-gated `expensesTotal`/`netCashFlow`, ikkala ruxsat holati test qilingan.
- [ ] G6: 5 band — i18n, CLI-419 backend test, schema guard, arifmetika refactor, stock alert retrigger.
- [ ] Har guruh — alohida worktree, TDD (failing test → impl → PASS), mustaqil verify-agent (adversarial review), typecheck toza.
- [ ] Har Linear ticket (CLI-446, 448-453) implementatsiyadan keyin "Done"ga o'tkaziladi (CLAUDE.md konventsiyasi — kechiktirilmaydi).
- [ ] G1/G3/G4/G5 — real-DB integration test (`bun test --env-file=../../.env`), mock/spy audit emas (`noopAudit` mavjud testlar uchun yashil qoladi).

## Scope tashqarisida (won't-fix bu spec'da)

- FIFO/batch-darajasidagi aniq COGS tracking (G4 faqat average-cost approksimatsiya) — agar aniq batch-consumption kerak bo'lsa, alohida keyingi ticket.
- CLI-451 uchun UI'da "prepay/kredit qo'llash" ish oqimi (masalan keyingi savdoda avtomatik kredit ishlatish) — hozircha faqat balans to'g'ri ko'rsatiladi, kredit avtomatik qo'llanmaydi (bu alohida feature, agar kerak bo'lsa).
