# CLI-418 — Proporsional refund yaxlitlash drifti (Σ per-bosqich negatsiya ≠ refund summasi)

Audit: AUDIT-2026-07-06.md · M5.

---

## 1. Muammo va ildiz sabab

`apps/api/src/modules/cashier/cashier.service.ts:280,322-331` — qisman/proporsional
refund asl to'lovning per-bosqich allocation'larini `factor` bilan negatsiya qiladi:

```ts
const factor = paid > 0 ? refundAmount / paid : 1;          // :280 — float
...
await tx.insert(treatmentStagePayments).values(
  origAllocations.map((a) => ({
    ...
    amount: String(-(Number(a.amount) * factor)),           // :328 — yaxlitlanmagan
  })),
);
```

`factor` — float (`refundAmount / paid`). Har bosqich negatsiyasi `Number(a.amount) *
factor` — yaxlitlanmagan JS float. `treatment_stage_payments.amount` ustuni
`numeric(14, 2)` (`packages/db-schema/src/tables/treatment-stage-payments.ts:27`) → PG
INSERT vaqtida 2 kasrga **yaxlitlaydi**. Har bosqich mustaqil yaxlitlanadi va **residual
(qoldiq) hech qayerda hisobga olinmaydi** → negatsiyalar yig'indisi refund summasidan
farq qiladi.

**Ssenariy (audit):** 3000 to'lov, 3 bosqichga 1000/1000/1000 taqsimlangan, refund 1000
→ `factor = 1/3 = 0.3333…`, har bosqich `-(1000 × 0.3333…) = -333.3333…` → PG `-333.33` ×3
= **-999.99**. Bemor 1000 qaytarib oldi, lekin balans-tiklash faqat 999.99 → **0.01 fantom
qoldiq** har bosqichda drift. Tizim "butun so'm" (integer som) ishlatsa ham `numeric(14,2)`
da kasr artefaktlar to'planadi va `computePlanBalance` (per-bosqich Σ allocation'dan
hisoblaydigan) noto'g'ri qoldiq ko'rsatadi. Refund summasini true-up qiladigan qator yo'q.

To'liq refund (`factor = 1`) — `Number(a.amount) * 1 = a.amount` aniq → drift YO'Q.
Muammo faqat proporsional (`factor < 1`) yo'lda.

---

## 2. Dizayn qarori

**Tanlangan:** minor-unit (tiyin, ×100 butun) arifmetikasi bilan har bosqich negatsiyasini
2 kasrga yaxlitlash **va oxirgi bosqichda qoldiqni "true-up" qilish** — shunda
negatsiyalar yig'indisi aynan `-refundAmount`ga teng bo'ladi.

Algoritm (`origAllocations` uchun):
```
refundMinor = round(refundAmount * 100)
paidMinor   = round(paid * 100)
let acc = 0
negations = origAllocations.map((a, i) => {
  const allocMinor = round(Number(a.amount) * 100)
  let negMinor
  if (i < last) {
    negMinor = round(allocMinor * refundMinor / paidMinor)   // proporsional, yaxlit
    acc += negMinor
  } else {
    negMinor = refundMinor - acc                              // true-up (qoldiq oxirgiga)
  }
  return String(-(negMinor / 100))                            // "-333.33" / "-333.34"
})
```

- **Nima uchun oxirgi bosqich true-up:** determenistik, oddiy; Σ = aynan refundMinor.
  Proporsionallik faqat oxirgi bosqichda ±0.01 chetlashadi (ko'zga ko'rinmas). Refund
  bekor-qilinmaydigan (delete endpoint yo'q) → keyingi drift to'planmaydi.
- **To'liq refund invariantI:** `factor = 1` bo'lganda `allocMinor * refundMinor /
  paidMinor = allocMinor` (chunki refundMinor==paidMinor) → har negMinor aynan
  `-allocMinor`, oxirgi true-up ham `-allocMinor` → **har bosqich remaining aynan asl
  cost'ga tiklanadi, kasr qoldiq yo'q**.
- **Minor-unit yaxlitlash** float `toFixed(2)`ga qaraganda barqaror (banker's-rounding
  emas, `Math.round` yarim-yuqoriga — pul konteksti uchun yetarli va determenistik).

**Rad etilgan alternativalar:**
- *Faqat `toFixed(2)` har bosqichda, true-up'siz* — yaxlitlanadi, lekin yig'indi hali ham
  refunddan farq qiladi (3× -333.33 = -999.99). Muammoni yechmaydi.
- *Butun refundni bitta bosqichga (eng katta allocation) yozish* — per-bosqich balansni
  buzadi (bir bosqich ortiqcha kreditlanadi). Proporsionallik yo'qoladi.
- *Bazada `numeric`ni `numeric(14,4)`ga oshirish* — ildiz sababni (integer taqsimlash
  qoldig'i) yechmaydi, faqat driftni kichraytiradi; migratsiya + response shakli
  o'zgaradi.

---

## 3. Spec — xulq + edge cases + test case'lar

### Xulq
- Proporsional refundda per-bosqich negatsiyalar yig'indisi **aynan** `-refundAmount`
  (2 kasr).
- To'liq refundda har bosqich remaining aynan asl cost'ga tiklanadi (kasr qoldiq 0).
- Ketma-ket qisman refundlar (cumulative) — har biri o'z `refundAmount`iga true-up
  qiladi; Σ cumulative refund = paid bo'lganda barcha bosqich remaining tiklanadi.

### Edge cases
- **Bir bosqichli allocation** — `last = 0` → true-up butun refundMinor'ni oladi (aniq).
- **`paid` da 0-allocation bosqich** — `allocMinor = 0` → negMinor 0; qoldiq oxirgi
  nonzero... (true-up doim oxirgi indeksga; agar oxirgi 0 bo'lsa ham qoldiq unga tushadi —
  0-allocation bosqichga kichik negatsiya yozilishi mumkin, lekin plan balansi jami bo'yicha
  to'g'ri qoladi; hujjatlashtirilgan — allocation'lar odatda nonzero).
- **`refundAmount == paid` (to'liq)** — factor 1, har bosqich aniq.
- Yaxlitlash butun-som summalarda ham ishlaydi (masalan 1000.00) — no-op.

### Test case'lar (`apps/api/tests/integration/cli-418-refund-rounding.test.ts`, real DB)
`cli-244-partial-refund.test.ts` seed patternidan (balans-darajali `planDebt`) foydalanadi.
Konkret raqamlar:

- **T1 (3000 / 1000×3, refund 1000):** 3 bosqich (cost 1000 har biri), 3000 to'lov, har
  bosqichga 1000 allocation. `refund(txId, 1000)` → refund tx'ning uch `treatment_stage_
  payments` negatsiyasi yig'indisi **aynan -1000.00** (`SELECT SUM(amount) WHERE
  transaction_id = refundTx.id` = `-1000.00`). Negatsiyalar `{-333.33, -333.33, -333.34}`
  (true-up oxirgida).
- **T2 (to'liq refund, kasr qoldiq yo'q):** yuqoridagi to'lovni to'liq (3000) refund →
  har bosqich remaining (cost − Σ allocation) aynan asl cost'ga (1000) tiklanadi; hech
  bir bosqichda kasr qoldiq (`!= 0` va `abs < 1`) qolmaydi.
- **T3 (planDebt aniq):** refund 1000 dan keyin `balanceFor().planDebt` aynan kutilgan
  butun qiymat (0.01 drift yo'q).
- **T4 (cumulative):** 1000 + 1000 + 1000 ketma-ket qisman refund = 3000 (to'liq) →
  jami negatsiya aynan -3000.00, original `voided`.

---

## 4. Implementatsiya rejasi (TDD)

1. **Failing test:** `cli-418-refund-rounding.test.ts` (T1–T4). Hozirgi kod uchun T1
   `-999.99...` → qizil.
2. **Refaktor `refund` (cashier.service.ts:315-331):** `origAllocations.map` o'rniga
   minor-unit + true-up loop. Sof arifmetikani testlanadigan helperga ajratish tavsiya
   etiladi: `apps/api/src/modules/cashier/cashier.calc.ts` (yoki mavjud bo'lsa unga)
   `distributeRefundNegations(origAllocations, refundAmount, paid): string[]` —
   Σ = `-refundAmount` invariantini kafolatlaydi. Unit test (`cashier.calc.test.ts`)
   sof arifmetika uchun (DB'siz).
3. **Verify:** `cd apps/api && bun test --env-file=../../.env cli-418` + mavjud
   `cli-244-partial-refund.test.ts` yashil (regressiya yo'q — u 40000/60000/100000 butun
   summalar, drift'siz, o'zgarmasligi kerak). `bun run typecheck`.

---

## 5. Migratsiya / rollout / xavflar
- **Migratsiya YO'Q** — faqat hisob-kitob mantig'i; schema o'zgarmaydi.
- **Backward-compat:** butun-som allocation'lar (mavjud ma'lumotning aksariyati) uchun
  natija o'zgarmaydi (yaxlitlash no-op). Faqat kasrli proporsional refundlar tuzatiladi.
- **Eski drift ma'lumot:** allaqachon yozilgan `-999.99` qatorlar retroaktiv tuzatilmaydi
  (immutable ledger) — faqat yangi refundlar to'g'ri. (Agar kerak bo'lsa, alohida
  data-fix ticket; auditda talab qilinmagan.)
- **Xavf:** minimal — sof funksiya, invariant testlar bilan qopqoqlangan.

## 6. Qabul mezonlari
- [ ] T1: 3000/1000×3, refund 1000 → negatsiyalar yig'indisi aynan `-1000.00`.
- [ ] T2: to'liq refunddan keyin hech bir bosqichda kasr qoldiq qolmaydi.
- [ ] T3: `planDebt` 0.01 driftsiz.
- [ ] `distributeRefundNegations` unit invariant testi (turli split/refund) — Σ doim
      `-refundAmount`.
- [ ] `cli-244-partial-refund.test.ts` yashil (regressiya yo'q).

## 7. Ta'sirlangan fayllar
- `apps/api/src/modules/cashier/cashier.service.ts` — `refund` negatsiya taqsimoti.
- `apps/api/src/modules/cashier/cashier.calc.ts` — yangi sof helper (yoki mavjud calc
  fayliga).
- `apps/api/src/modules/cashier/cashier.calc.test.ts` — sof arifmetika invariant testi.
- `apps/api/tests/integration/cli-418-refund-rounding.test.ts` — yangi integratsiya test.
