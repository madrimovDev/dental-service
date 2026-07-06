# CLI-406 — To'liq refund daromaddan IKKI marta ayiriladi

> SPEC + IMPLEMENTATSIYA REJASI (kod o'zgartirilmagan). Audit: `AUDIT-2026-07-06.md` H2.

## 1. Muammo va ildiz sabab

To'liq refund ikki xil buxgalteriya izini bir vaqtda qoldiradi:

1. Asl tranzaksiya `status='voided'` bo'ladi — `cashier.service.ts:334-339`:
   ```ts
   if (alreadyRefunded + refundAmount >= paid) {
     await tx.update(cashierTransactions).set({ status: 'voided' })
       .where(eq(cashierTransactions.id, id));
   }
   ```
2. Kompensatsion `type='refund' status='completed'` qatori qo'shiladi — `cashier.service.ts:294-312`.

Daromad agregatlari esa **ikkalasiga ham** reaksiya beradi:

- `reports.service.ts:41` — `signedPaidAmount = SUM(CASE WHEN type='refund' THEN -paidAmount ELSE +paidAmount END)`.
- `reports.service.ts:63, 114` — filtr `status='completed'` (void'langan asl **chiqib ketadi**).
- `payroll.service.ts:63-72` — bir xil signed formula, `status='completed'` filtri bilan (`createRun`).

Natija: void'langan asl summa completed-filtrdan tushadi (−1×), refund qatori esa hali manfiy sanaladi (−1×) → **teskarilash IKKI marta**.

**Ssenariy (audit):** 1,000,000 to'lov Iyun10 → to'liq refund Iyun12. `revenue(Iyun)` net = 0 bo'lishi kerak, aslida = **−1,000,000**. Payroll shifokordan komissiyani ortiqcha ushlaydi; yopilgan davr hisobotlari retroaktiv buziladi.

**Nega qisman refund to'g'ri:** qisman yo'lda (`refundAmount < paid`) asl `completed` qoladi (`:334` sharti bajarilmaydi) → faqat refund qatori (−1×) sanaladi → to'g'ri. Ya'ni **faqat void yo'li buzuq**; qisman refund modeli allaqachon izchil.

### `voided` iste'molchilarini inventarizatsiyasi (grep bilan tasdiqlangan)

`status='voided'` **butun kodda faqat BITTA joyda O'RNATILADI** — `cashier.service.ts:337` (to'liq-refund void). Boshqa hech qanday kod yo'li bu holatni ishlab chiqarmaydi. O'qiydigan joylar:

| Fayl:qator | Iste'mol | Void olib tashlangach ta'sir |
|---|---|---|
| `cashier.service.ts:251` | `if (original.type === 'refund' || original.status === 'voided')` — refund guard | Yangi ma'lumotda hech qachon `voided` bo'lmaydi; guard zararsiz qoladi (defensiv — pastga qarang). Refund-of-refund cumulative guard (`refundAmount > remaining`) bilan baribir rad etiladi. |
| `reports.service.ts:63,114,142,391,499` | `status='completed'` filtri | Asl endi `completed` qoladi → daromadga bir marta `+`, refund qatori bir marta `−` → **net 0 (to'g'ri)**. |
| `payroll.service.ts:69` | `status='completed'` filtri | Xuddi shu — komissiya net 0. |
| `cashier.service.ts:372` (`dailySummary`) | `status='completed'` filtri | Asl `completed` qoladi (yaratilgan kunida), refund qatori `completed` (refund kunida). CLI-419 bilan birga to'g'ri kassa oqimi. |
| `web/.../TransactionsTable.tsx:89` | `tx.status === 'voided' ? 'red'` rang | To'liq-refundlangan asl endi `completed` (teal) ko'rinadi + alohida orange refund qatori — **aynan qisman-refund modeli**. Vizual izchillik oshadi, xato emas. |
| `cashier.schema.ts:82`, `db-schema/cashier.ts:27` | enum a'zosi `'voided'` | Enum SAQLANADI (tarixiy qatorlar + kelajakdagi ehtimoliy manual void uchun). |

## 2. Dizayn qarori

**DECISION (task bilan berilgan):** to'liq-refundda void'ni OLIB TASHLASH. Asl tranzaksiya BARCHA refund holatlarida `status='completed'` qoladi; buxgalteriya faqat manfiy `type='refund'` qatoriga tayanadi — **qisman-refund modeli bilan bir xil, yagona izchil model**.

Amalda: `cashier.service.ts:333-339` blokini (void update) butunlay olib tashlash. Boshqa refund mexanizmi (kompensatsion refund txn + proporsional negative allocation, cumulative guard) o'zgarmaydi.

`:251` dagi `original.status === 'voided'` guardi **SAQLANADI** (defensiv): backfill'dan keyin zararsiz, backfill qilinmagan tarixiy qatorni qayta-refund qilishni bloklaydi.

**Rad etilgan alternativalar:**
- *Void'ni saqlab, reports/payroll filtrini `status IN ('completed','voided')` ga o'zgartirish* — rad: 5+ query'da tarqoq filtr, kelajakda yana bir marta unutish oson; ikki model (void + refund-row) baribir qoladi.
- *Void'ni saqlab, refund qatorini daromaddan chiqarish (faqat void hisoblash)* — rad: qisman refund refund-qatorga tayanadi; ikki xil mantiq (full=void, partial=row) — hozirgi bug manbai.

## 3. Spec — xulq + edge case'lar + test case'lar

**Invariant:** har refund holatidan keyin `revenue(range)` = Σ(kirgan to'lovlar) − Σ(qaytarilgan), ya'ni to'liq refundda net 0.

Edge case'lar:
- **E1 — to'liq refund:** 1,000,000 payment → to'liq refund. Asl `completed` qoladi. `revenueTotal` net = 0. Payroll komissiya net = 0.
- **E2 — qisman keyin qolgan:** 1,000,000 → 400,000 refund → 600,000 refund. Har ikki refund `completed` qatorlar; asl doim `completed`. Yakuniy net = 0. Oraliq holatda net = 600,000 (1,000,000 − 400,000).
- **E3 — refund-of-refund rad:** `type='refund'` qatorni refund qilish `:251` orqali `invalid`. To'liq-refund qilingandan keyin yana refund → `remaining=0` → `refundAmount > remaining` → `over_refund`. **Void'siz ham ishlaydi** (cumulative guard `paidAmount` o'qiydi).
- **E4 — plan-linked balans:** proporsional negative allocation'lar o'zgarmaydi; `computePlanBalance` asl tranzaksiya statusini umuman o'qimaydi → **plan/bemor balansi void'dan mustaqil, ta'sirlanmaydi**.
- **E5 — non-plan to'liq to'langan (total=paid):** `nonPlanRemainder = total−paid = 0`. Void bo'lsa ham, bo'lmasa ham 0 → **xulq bir xil**.
- **E6 — non-plan KAM to'langan (total>paid) to'liq refund:** yagona divergensiya — pastda "Xavflar" bo'limiga qarang (accept, blocker EMAS).

Konkret test case'lar (`bun test`, `db.transaction` rollback pattern, cli-244 uslubi):
1. `revenue-net-zero-on-full-refund`: payment yarat → `refund(c, id)` → `reportsService.revenueTotal(c, range)` === 0; asl qator `status === 'completed'`.
2. `payroll-net-zero-on-full-refund`: plan-linked payment (doctorId bor) → to'liq refund → `createRun` → shu doctor `attributedRevenue === 0`, `commissionAmount === 0`.
3. `partial-then-remainder-net-zero`: 400k + 600k refund → `revenueTotal` === 0; oraliqda 600k.
4. `refund-of-refund-rejected`: to'liq refund → yana `refund(c, id)` → `{ ok: false, reason: 'over_refund' }`.
5. `plan-balance-unaffected`: plan-linked to'liq refund → `planBalance` / `balanceFor` void modelidagi bilan bir xil natija.

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — `apps/api/tests/integration/cli-406-refund-revenue.test.ts` yoz (test case 1-5). Hozir test #1 `revenueTotal === -1_000_000` bilan **qizil**.
2. **Impl** — `cashier.service.ts` `refund()` funksiyasidan `:333-339` void blokini o'chir:
   ```ts
   // OLIB TASHLANADI:
   // if (alreadyRefunded + refundAmount >= paid) {
   //   await tx.update(cashierTransactions).set({ status: 'voided' })
   //     .where(eq(cashierTransactions.id, id));
   // }
   ```
   `:251` guardi va qolgan mantiq o'zgarmaydi. Docstring (`:229-231`) yangilanadi ("Original hech qachon void qilinmaydi — refund qatori yagona iz").
3. **Verify** — `cd apps/api && bun test --env-file=../../.env cli-406-refund-revenue`; `cli-244-partial-refund` regressiyasiz o'tishini tasdiqla; `bun run typecheck`.

## 5. Migratsiya / rollout / xavflar

**Tarixiy `voided` qatorlar — backfill (TAVSIYA: HA).** Grep isbotladi: `voided` FAQAT `:337` da o'rnatiladi → har `voided` qatori mos `type='refund'` qatoriga ega to'liq-refund asli. Shuning uchun quyidagi xavfsiz va o'z-o'zini tuzatuvchi:

```sql
-- data-only migration (drizzle SQL migration sifatida)
UPDATE cashier_transactions SET status = 'completed' WHERE status = 'voided';
```

Backfill qilinmasa — tarixiy qatorlar **ikki marta ayirilgan** holatda qoladi (completed-filtrdan chiqarilgan VA refund tomonidan negatsiya qilingan). Backfill'dan keyin ular bir marta hisoblanadi.

**Ko'rinadigan oqibat:** yopilgan davr `revenue`/payroll qiymatlari **ko'tariladi** — bu bug'ning tuzatilishi, regressiya EMAS. Rollout eslatmasi: backfill ilgari yakunlangan payroll_runs snapshot'larini o'zgartirmaydi (ular `payroll_lines`da muzlatilgan) — faqat kelajakdagi hisobotlar/run'lar to'g'rilanadi. Buni relez-note'da ko'rsatish kerak.

**Xavf E6 — non-plan underpaid to'liq refund (accept, BLOKER EMAS):** yagona divergensiya. `nonPlanRemainder = total − paid` (`patients.service.ts:140-141, 210-211`, `type='payment' AND status='completed'`). Void bilan: to'liq refund asl'ni void qilardi → remainder debt yo'qolardi. Void'siz: asl `completed` qoladi → remainder (masalan 200,000) qarz bo'lib qoladi.
- Plan-linked yo'l **ta'sirlanmaydi** (proporsional negative allocation + `computePlanBalance` asl statusni o'qimaydi).
- Non-plan balans refundlarni **hech qachon kuzatmagan** (refund qatori `type='refund'` → `type='payment'` filtri chiqarib tashlaydi).
- Semantik asos: refund **to'langan naqdni** teskari qiladi, **hisob-faktura qarzini** emas. To'liq to'langan (total=paid) holatda farq YO'Q.
- **Tavsiya:** pre-existing cheklov sifatida qabul qilish; agar mijoz non-plan sotuvni to'liq bekor qilishni xohlasa — alohida ticket (POS-sale void semantikasi). Bu CLI-406 blokeri emas.

**Konkurentlik:** refund allaqachon `.for('update')` bilan row-lock qiladi (`:248`) → o'zgarmaydi.

## 6. Qabul mezonlari

- [ ] `refund()` da void update bloki yo'q; asl BARCHA holatda `completed` qoladi.
- [ ] To'liq refunddan keyin `revenueTotal(range)` net = 0 (test #1 yashil).
- [ ] Payroll komissiya to'liq refunddan keyin net = 0 (test #2 yashil).
- [ ] Qisman→qolgan ketma-ketligi net = 0 (test #3).
- [ ] Refund-of-refund rad etiladi (test #4).
- [ ] Plan/bemor balansi void modelidagi bilan bir xil (test #5, `cli-244` regressiyasiz).
- [ ] Backfill migration mavjud + relez-note yopilgan-davr o'zgarishini hujjatlaydi.
- [ ] `bun run typecheck` toza.

## 7. Ta'sirlangan fayllar

- `apps/api/src/modules/cashier/cashier.service.ts` — `:333-339` void bloki olib tashlanadi; `:223-231` docstring yangilanadi. (`:251` guard SAQLANADI.)
- `apps/api/drizzle/` — yangi data-only migration (`UPDATE ... SET status='completed' WHERE status='voided'`).
- `apps/api/tests/integration/cli-406-refund-revenue.test.ts` — YANGI.
- (O'zgarishsiz, tasdiq uchun tekshiriladi:) `reports.service.ts`, `payroll.service.ts`, `cashier.billing.ts`, `patients.balance.ts`, `web/.../TransactionsTable.tsx`.
