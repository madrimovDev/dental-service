# R2 — Kassa (POS + tranzaksiyalar): Design Spec

- **Sana:** 2026-06-11
- **Epik:** R2 / Linear CLI-49 (Kassa: POS + tranzaksiyalar), Milestone M5
- **Bog'liq:** [RFC-0010](../../rfcs/0010-frontend-feature-architecture.md), R2 etalon, **Billing poydevori spec** (`2026-06-11-r2-billing-foundation-design.md` — bog'liqlik), cashier moduli
- **Status:** Approved (brainstorm), spec → plan'ga tayyor
- **Branch:** `feat/r2-cashier` (**Billing poydevori main'ga merge bo'lgandan keyin** main'dan branch/rebase)

## Maqsad

Mavjud `apps/web/src/pages/cashier.page.tsx` (369q, POS + kunlik xulosa + tranzaksiyalar) RFC-0010 `features/cashier/` ga ko'chiriladi + teal re-skin. 2 frontend gap (narx avto-to'ldirish, bemor selektori) yopiladi. **Billing poydevori** (treatment-plan to'lov allocation) iste'mol qilinadi: plandan to'lov + bosqich balansi UI.

## Qamrov

**Ichida:** `features/cashier/`, POS (savat + narx avto + bemor selektori), kunlik xulosa, tranzaksiyalar ro'yxati + refund (confirm→modal), **plan billing UI** (bemor planini tanlash → bosqich balansi → to'lov allocation), i18n uz+ru.

**Tashqarida:**
- Billing **backend** (allocation jadval, balans endpoint) → Billing poydevori spec (alohida, oldin quriladi).
- Fiscal/print → M6 (noop provider qoladi).
- Bemor umumiy balansi (barcha plan bo'yicha) → R3.

## Bog'liqlik (muhim)

Bu ekran **Billing poydevori** (`feat/r2-billing`) main'ga merge bo'lgandan keyin quriladi — `cashier.create` allocation body + `cashier.planBalance` api-client mavjud bo'lishi shart. Klinik/Settings/Xizmatlar'dan mustaqil (parallel).

## Qarorlar (brainstorm)

| # | Qaror | Asos |
|---|---|---|
| 1 | **Re-skin + 2 frontend gap + backend gap (billing)** | Foydalanuvchi tanladi |
| 2 | **Narx avto-to'ldirish** — savatga qo'shilganda filial narxi (`service.get` detail prices) | UX gap; kassir har narxni qo'lda kiritmaydi |
| 3 | **Bemor selektori** — POS'da bemor tanlash (`patientId` allaqachon backend'da wired) | UI gap; tranzaksiyani bemorga bog'lash |
| 4 | **Plan billing** — bemor planini tanlab bosqich(lar)ni to'lash, allocation + balans | Foydalanuvchi to'liq tanladi (billing poydevori orqali) |
| 5 | **refund `confirm()` → Mantine modal** | R2 pattern |

## 1. `features/cashier/` (kanonik RFC-0010)

```
apps/web/src/features/cashier/
├── index.ts
├── cashier.keys.ts        # cashierKeys.today(branchId) / summary(branchId) / planBalance(planId) / all
├── cashier.types.ts       # CartItem, TransactionVM, PlanBalanceVM
├── cashier.mappers.ts      # REAL (sof): cart→create payload; tranzaksiya→VM; netTotal/allocation hisobi
├── cashier.api.ts         # hooks: useTodayTransactions / useDailySummary / useCreateTransaction / useRefund / usePlanBalance / useServicePrice
├── cashier.schema.ts      # POS form Zod (savat/chegirma/to'lov)
└── components/
    ├── CashierScreen.tsx       # branch select + 2 ustun layout (POS | xulosa+tranzaksiyalar)
    ├── PosPanel.tsx            # savat, narx, chegirma, to'lov usuli, bemor selektori, charge
    ├── CartTable.tsx           # savat satrlari (qty/price/remove)
    ├── PlanBillingPanel.tsx    # bemor plani tanlash → bosqich balansi → to'lash (allocation)
    ├── DailySummaryCard.tsx    # kunlik breakdown
    └── TransactionsTable.tsx   # bugungi tranzaksiyalar + refund (modal confirm)
```

**Qatlam:** `components → cashier.api.ts (hooks) → api-client`. `cashier.mappers.ts` sof (netTotal, allocation payload, VM).

## 2. POS (re-skin + gaplar)

- **Layout:** branch select (yuqorida); ikki ustun (`SimpleGrid lg:2`) — chap POS, o'ng kunlik xulosa + tranzaksiyalar. teal + R0.
- **Savat:** xizmat qidiruv Select → qo'shish. **Narx avto-to'ldirish (gap 2):** xizmat savatga qo'shilganda tanlangan filial bo'yicha narx `useServicePrice(serviceId, branchId)` (yoki `service.get(id).prices`dan topiladi) → `unitPrice` avto. Qo'lda o'zgartirish mumkin (override).
- **Bemor selektori (gap 3):** searchable Select (`api.patients.list`), ixtiyoriy. `patientId` create'ga uzatiladi (allaqachon wired).
- **Chegirma, to'lov usuli, to'langan summa, notes** — mavjud. `netTotal` mapper'da.
- **Charge** → `useCreateTransaction`. Success → savat tozalanadi + invalidate.

## 3. Plan billing UI (billing poydevorini iste'mol)

- **PlanBillingPanel** (POS'da rejim yoki tab): bemor tanlanganda uning treatment-plan(lar)i ko'rsatiladi (`api.clinical.listPlans(patientId)` mavjud).
- Plan tanlanganda **`usePlanBalance(planId)`** → bosqichlar ro'yxati: `serviceName`, `cost`, `paid`, `remaining` (StatusPill: to'langan/qisman/to'lanmagan).
- To'lanmagan/qisman bosqich(lar)ni tanlab "to'lash" → savatga emas, **allocation** sifatida: `useCreateTransaction({ treatmentPlanId, allocations: [{stageId, amount}], paidAmount, paymentMethod })`.
- Success → `planBalance` + `cashier` invalidate; balans yangilanadi.
- **Ikki rejim:** (a) erkin POS (savat, walk-in/xizmat) — mavjud; (b) plan billing (bosqich allocation). UI'da segmented yoki tab bilan ajratiladi. Plan'da aniqlanadi.

## 4. Tranzaksiyalar + refund

- **TransactionsTable:** bugungi tranzaksiyalar (receipt, summa, usul, status/type Badge). teal re-skin.
- **Refund:** `cashier.refund` permission, `status==='completed' && type==='payment'`. `confirm()` → Mantine confirm modal. Refund billing allocation'larini negate qiladi (poydevor backend'da; UI faqat `planBalance` invalidate qiladi).
- **DailySummaryCard:** breakdown (usul × type × count × total).

## 5. i18n + R0 primitiv

- `cashier.*` kengaytirish: bemor selektori, plan billing (plan tanlash, bosqich balansi, to'lash, qisman/to'langan), refund modal → **uz + ru**. Mavjud `cashier.*` saqlanadi.
- R0: `PageHead`, `Select`, `NumberInput`, `Textarea`, `Table`, `Card`, `Badge`/`StatusPill`, `Button`, `Modal`, `Mono`, `Tabs`/segmented.

## 6. Testlar

- **`cashier.mappers.test.ts`** (eng muhim): `netTotal` (savat − chegirma); cart→create payload; allocation payload (bosqich+amount); tranzaksiya→VM.
- **`cashier.keys.test.ts`**: factory.
- **`PlanBillingPanel`** behavioral: plan tanlash → balans ko'rsatish; bosqich tanlab to'lash → `createTransaction` allocation bilan chaqiruvi.
- **`PosPanel`** behavioral: xizmat qo'shilganda narx avto-to'ldiriladi (mock `useServicePrice`); charge → create.
- **`CashierScreen`** smoke.

## 7. Verifikatsiya

- `turbo test --filter @dental/web` + `@dental/api` typecheck + build + RLS.
- Dev fidelity (inson): narx avto, bemor bog'lash, erkin POS, plan billing (bosqich to'lash → balans kamayadi), refund (balans tiklanadi), kunlik xulosa.

## Qurilish tartibi (plan'da)

1. `features/cashier/` skelet: keys → types → mappers (+test) → api hooks → schema.
2. POS re-skin: CashierScreen + PosPanel + CartTable + narx avto + bemor selektori.
3. Tranzaksiyalar + refund modal + DailySummaryCard.
4. Plan billing: PlanBillingPanel (usePlanBalance + allocation) + behavioral test.
5. i18n + yupqa page entry (`cashier.page.tsx` → `<CashierScreen />`).
6. Verifikatsiya.

## Ochiq mayda nuqtalar (plan'da)

- Narx avto manbai: `service.get(id).prices` (add'da fetch, mayda N+1) vs bulk endpoint — **bulk backend gap QO'SHMAYMIZ** (Kassa backend touch faqat billing poydevori). `useServiceDetail` add paytida — yetarli.
- Erkin POS vs plan billing UI ajratish (tab/segmented) — plan'da.
- Plan billing'da `paidAmount` = allocation yig'indisi (qisman ruxsat) — mapper validatsiya.
