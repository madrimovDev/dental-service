# RFC-0005: Patient balance / ledger

- **Status:** Accepted
- **Sana:** 2026-06-09
- **Bog'liq:** [`docs/design-architecture-gap-analysis.md`](../design-architecture-gap-analysis.md), R3 (CLI-65), Linear CLI-88

> ⚠️ Yangilandi 2026-06-11 (CLI-67): plan-inclusive model qabul qilindi. Eski "faqat cashier SUM" formula superseded.

## Kontekst

Dizaynda **bemor balansi** ko'p joyda: bemorlar ro'yxati (Balans ustuni), kassa ("eski balans" carry-forward + qisman to'lov), bemor kartasi (balans + to'lovlar tarixi). Backend'da **balans yo'q** — faqat `cashier_transactions` bor.

Mavjud model (`cashier_transactions`): `totalAmount` (hisoblangan summa), `paidAmount` (to'langan), `discount`, `type` (`payment`/`refund`/`void`), `status`, + `cashier_transaction_items` (xizmat qatorlari). Ya'ni har tranzaksiya **ham chara (charge), ham to'lov** ni qamraydi (POS oqimi: xizmat qo'shiladi + to'lov olinadi, qoldiq = qarz).

Ikki qaror kerak:
1. **Manba modeli:** balansni `cashier_transactions`'dan olamizmi yoki alohida ledger jadval kiritamizmi?
2. **O'qish strategiyasi:** balans **computed** (har o'qishda SUM) yoki **materialized** (`patients.balance` ustun, har o'zgarishda yangilanadi)?

## Qaror

### 1. Manba: `cashier_transactions` + qabul qilingan reja qarzi (plan-inclusive)

**Balans = `planDebt + nonPlanBalance`** (plan-inclusive — Qaror #13, billing poydevori Qaror #11 bilan uyg'un):
```
patient_balance = planDebt + nonPlanBalance
```

**planDebt** — qabul qilingan davolash rejalari qarzi (status ∈ {`accepted`, `in_progress`, `completed`}; `draft` / `presented` / `cancelled` chiqariladi):
```
planDebt = Σ(treatment_stages.cost)  −  Σ(treatment_stage_payments.amount)
```

**nonPlanBalance** — rejaga bog'lanmagan kassa qoldig'i (`type=payment` ∧ `status=completed` ∧ `treatment_plan_id IS NULL`):
```
nonPlanBalance = Σ (totalAmount − paidAmount)
```

`> 0` = qarz (qizil), `< 0` = kredit/oldindan to'lov (yashil), `0` = neytral. Valyuta UZS (yagona).

**Refund:** alohida ayirish emas — *void + manfiy allocation* orqali nettlanadi. Plan qarzida refund manfiy `treatment_stage_payments` rowi sifatida `allocationSum`'ni kamaytiradi → qarz tiklanadi (Qaror #11). Plansiz qoldiqda asl tranzaksiya `voided` bo'ladi → yig'indidan avtomatik chiqib ketadi. Plan-linked (`treatment_plan_id IS NOT NULL`) va `refund`/`void` tipli tranzaksiyalar `nonPlanBalance`'da **sanalmaydi** → plan qarzi bilan double-count yo'q.

> Eski formula (faqat `cashier_transactions` SUM, tranzaksiya turiga qarab ishorali) **superseded** — reja bosqichlariga taqsimlangan qarzni o'tkazib yuborardi. Pastdagi "Muqobillar" / "Oqibatlar" bo'limlari tarixiy kontekst sifatida saqlanadi.

**Nega alohida ledger emas (hozir):** barcha chara'lar kassa orqali o'tadi (POS), demak `cashier_transactions` allaqachon charge+payment manbasi. Alohida `patient_account_entries` (debit/credit) jadvali — chara'lar kassadan tashqarida paydo bo'lganda yoki hisob tuzatishlari (write-off, manual adjustment) kerak bo'lganda kiritiladi. Hozir bu yo'q → YAGNI.

### 2. O'qish: COMPUTED (materialized ustun emas)

- Balans **har o'qishda hisoblanadi** — SQL aggregate (`SUM`), `cashier_transactions(patient_id)` indeksi bilan. Klinika masshtabida (1–10 doktor, kuniga o'nlab tranzaksiya) bu **arzon**.
- **`patients.balance` ustun KIRITILMAYDI** — drift va consistency yuki yo'q (har tranzaksiya/refund'da yangilash, race, reconciliation kerak bo'lardi).
- Implementatsiya: `patients.service`'da `getBalance(patientId)` yoki ro'yxat query'siga `LEFT JOIN ... SUM` (list'da N+1 emas, bitta aggregate join). Kerak bo'lsa Postgres **view** (`patient_balances`).

### 3. Qayerda ko'rsatiladi

- Bemorlar ro'yxati: aggregate join orqali Balans ustuni (qarz qizil, kredit yashil).
- Kassa: yangi tranzaksiya oldidan `getBalance` → "eski balans" carry-forward.
- Bemor kartasi: balans + tranzaksiyalar tarixi (To'lovlar tab).

## Muqobillar (ko'rib chiqilgan)

1. **Alohida ledger jadval (`patient_account_entries`) + computed.** Tozaroq "buxgalteriya" modeli, ko'p manbali chara va tuzatishlarni qo'llaydi. ➖ Yangi jadval + posting nuqtalari (qachon debit yoziladi) + kassa bilan dublikatsiya xavfi. Hozircha kerak emas — **defer** (qaytib ko'rish sharti: kassadan tashqari chara yoki hisob tuzatish kerak bo'lsa).
2. **Materialized `patients.balance` ustun.** Tez o'qish. ➖ Drift xavfi, har mutatsiyada yangilash, reconciliation, race. Klinika masshtabida tezlik muammosi yo'q → ortiqcha murakkablik.
3. **Cashier-derived + computed (tanlangan).** ✅ Yangi jadval yo'q, har doim to'g'ri (drift yo'q), masshtabga mos.

## Oqibatlar

- ➕ Yangi schema yo'q; mavjud `cashier_transactions`'dan; har doim izchil.
- ➕ Audit/reconciliation oson — balans manbasi yagona (tranzaksiyalar).
- ➖ Barcha chara kassa orqali degan taxminga bog'liq. Agar kelajakda chara kassadan tashqarida paydo bo'lsa — Muqobil 1 (ledger)ga o'tiladi.
- ➖ Juda katta tarixda (yillar, o'n minglab tranzaksiya/bemor) aggregate sekinlashishi mumkin — o'shanda materialized cache (Muqobil 2) **o'lchangan ehtiyoj** asosida qo'shiladi, oldindan emas.
- 🔁 Qaytib ko'rish: kassadan tashqari chara / hisob tuzatish / o'lchangan perf muammosi.

## Ochiq savollar

- `totalAmount` discount'dan oldin yoki keyin? Aniq formula — kassa modeli bilan birga implementatsiyada qotiriladi (RFC-0007/kassa qayta ko'rikda).
- Balans valyutasi — `UZS` (yagona); multi-currency hozir yo'q.
