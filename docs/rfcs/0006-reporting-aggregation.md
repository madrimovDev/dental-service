# RFC-0006: Reporting & aggregation (dashboard / KPI)

- **Status:** Accepted
  > ⚠️ Implemented 2026-06-11 (CLI-68).
- **Sana:** 2026-06-09
- **Bog'liq:** [RFC-0005](./0005-patient-balance-ledger.md), [`docs/ux-ia-concept.md`](../ux-ia-concept.md), R3 (CLI-65), Linear CLI-89

## Kontekst

6 rol dashboard'i + reports kutubxonasi + menejer/buxgalter KPI'lari **agregatsiyaga** muhtoj: daromad (doktor/xizmat/filial bo'yicha), no-show%, slot bandligi, plan completion%, doktor yuklamasi, kunlik kassa, no-show trend. Backend'da faqat `cashier/daily-summary` bor.

Ochiq tanlov: **query-time** (so'rovda SQL GROUP BY) vs **precomputed** (materialized view / rollup jadval + cron).

## Qaror

### 1. `reports` (analytics) moduli — query-time agregatsiya

Yangi `apps/api/src/modules/reports/` — har metrika uchun query funksiya (`revenueByDoctor`, `noShowRate`, `slotUtilization`, `planCompletion`, `doctorWorkload`, `dailyCash`…). Endpoint'lar dashboard/report bo'yicha (rol dashboard'lari shu metrikalarni qayta ishlatadi).

- **Query-time SQL `GROUP BY`** mavjud indekslangan jadvallar ustidan (`cashier_transactions`, `appointments`, `visit_notes`, `treatment_plans`). Tenant-scoped (RLS).
- **Parametrlar:** sana oralig'i (kun/hafta/oy), filial filtri (Owner — barcha; Branch Manager — o'z filiali).
- Klinika masshtabida (1–10 doktor) tipik oraliqlar (kun/hafta/oy) ustidan aggregate **arzon**.

### 2. Precompute YO'Q (hozir)

Materialized view / rollup jadval / cron job **kiritilmaydi**. Sabab: drift + yangilanish murakkabligi (cron, invalidatsiya) klinika hajmida asoslanmagan. Query-time har doim joriy va izchil.

### 3. Caching — Redis short-TTL, faqat kerak bo'lganda

- Boshida **to'g'ridan query-time** (cache yo'q) — soddalik.
- Agar biror dashboard qimmat/tez-tez urilsa → **Redis short-TTL cache** (masalan 1–5 daqiqa), key `tenant:report:<name>:<params>`. BullMQ/Redis allaqachon stack'da.
- Bu **o'lchangan ehtiyoj** asosida qo'shiladi, oldindan emas (YAGNI).

### 4. Metrikalar katalogi (manba jadvallar)

| Metrika | Manba |
|---|---|
| Daromad (doktor/xizmat/filial, davr) | `cashier_transactions` + `_items` |
| Kunlik kassa | `cashier_transactions` |
| No-show % / trend | `appointments` (status=no_show / total) |
| Slot bandligi | `appointments` (band slot / ish vaqti) |
| Plan completion % | `treatment_plans` + `treatment_stages` (status) |
| Doktor yuklamasi | `appointments`/`visit_notes` (doktor bo'yicha) |
| Top xizmatlar | `cashier_transaction_items` / `visit_notes.performedServices` |

## Implementatsiya eslatmalari (CLI-68, 2026-06-11)

Joriy implementatsiyada quyidagi taxminlar/cheklovlar mavjud — KPI'larni o'qishda hisobga olinadi:

- **`byService` faqat itemli POS sotuvni qamraydi.** Daromad xizmat bo'yicha breakdown'i `cashier_transaction_items` (POS satrlari) ustidan agregatsiya qilinadi. Plan-billing tranzaksiyalarida `_items` yo'q (bosqich to'lovi `treatment_stage_payments` orqali allocate qilinadi), shu sababli plan tushumi xizmatlarga taqsimlanmaydi va `byService`'da ko'rinmaydi.
- **`revenueByDoctor` faqat plan-linked tushumni doktorga bog'laydi.** `treatment_plan_id` mavjud tranzaksiyalar `treatment_plans.doctorId` orqali doktorga biriktiriladi; plansiz (walk-in) tushum doktorga bog'lanmaydi va `doctorId: null` ("Belgilanmagan") sifatida qaytariladi.
- **`slotUtilization` ish-vaqti taxminiga tayanadi.** Capacity = `branches.workHours` (kalit konvensiyasi `sun`..`sat`; sozlanmagan kun → default 540 daqiqa = 09:00–18:00; `null` kun → 0/yopiq; butun `workHours` `null` → default) × shu davrda band bo'lgan distinct doktor soni (capacity proxy — real "ish o'rni/stul" modeli yo'q). Bu taxminiy ko'rsatkich.

## Muqobillar (ko'rib chiqilgan)

1. **Materialized view'lar.** Tez o'qish. ➖ `REFRESH` strategiyasi (cron yoki on-write), eskirgan ma'lumot, RLS bilan murakkab. Hozir kerak emas.
2. **Rollup jadvallar + cron (kunlik/soatlik agregat).** Katta masshtabda yaxshi. ➖ Yangi jadvallar, cron, backfill, izchillik yuki. Klinika hajmi uchun haddan tashqari.
3. **Query-time + ixtiyoriy Redis cache (tanlangan).** ✅ Yangi infra yo'q, har doim joriy, masshtabga mos; cache faqat o'lchangan ehtiyojda.

## Oqibatlar

- ➕ Yangi schema/cron yo'q; mavjud jadvallardan; har doim joriy.
- ➕ Rol dashboard'lari va reports bir xil query funksiyalarini qayta ishlatadi.
- ➖ Murakkab/keng oraliqli hisobotlar (yillik, ko'p-filial) sekinroq bo'lishi mumkin — o'shanda Redis cache yoki (oxirgi chora) rollup qo'shiladi, o'lchovga ko'ra.
- 🔁 Qaytib ko'rish: o'lchangan perf muammosi yoki juda katta ma'lumot hajmi.

## Ochiq savollar

- Hisobot eksporti (dizaynda "Eksport") — format (Excel/CSV/PDF)? — Taklif: CSV/Excel boshida; PDF keyin. 1C eksport alohida (CONCEPT).
- Real-time dashboard yangilanishi kerakmi (poll/websocket)? — Taklif: yo'q; oddiy refetch (TanStack Query `refetchInterval` kerak bo'lsa).
