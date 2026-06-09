# RFC-0005: Patient balance / ledger

- **Status:** Accepted
- **Sana:** 2026-06-09
- **Bog'liq:** [`docs/design-architecture-gap-analysis.md`](../design-architecture-gap-analysis.md), R3 (CLI-65), Linear CLI-88

## Kontekst

Dizaynda **bemor balansi** ko'p joyda: bemorlar ro'yxati (Balans ustuni), kassa ("eski balans" carry-forward + qisman to'lov), bemor kartasi (balans + to'lovlar tarixi). Backend'da **balans yo'q** — faqat `cashier_transactions` bor.

Mavjud model (`cashier_transactions`): `totalAmount` (hisoblangan summa), `paidAmount` (to'langan), `discount`, `type` (`payment`/`refund`/`void`), `status`, + `cashier_transaction_items` (xizmat qatorlari). Ya'ni har tranzaksiya **ham chara (charge), ham to'lov** ni qamraydi (POS oqimi: xizmat qo'shiladi + to'lov olinadi, qoldiq = qarz).

Ikki qaror kerak:
1. **Manba modeli:** balansni `cashier_transactions`'dan olamizmi yoki alohida ledger jadval kiritamizmi?
2. **O'qish strategiyasi:** balans **computed** (har o'qishda SUM) yoki **materialized** (`patients.balance` ustun, har o'zgarishda yangilanadi)?

## Qaror

### 1. Manba: `cashier_transactions`'dan olamiz (alohida ledger DEFER)

**Balans = SUM per bemor**, tranzaksiya turiga qarab ishorali:
```
balance(patient) = Σ  (type=payment) : (totalAmount − paidAmount)   // qoldiq qarz +
                      (type=refund)  : −(refund summasi)            // qaytarilgan
                      (type=void)    : 0                            // bekor, hisobga olinmaydi
```
(`status=completed` lar; `pending`/`voided` chiqariladi. Aniq formula — implementatsiya tafsiloti, `discount` `totalAmount`'ga singdirilgan deb qabul qilinadi.)

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
