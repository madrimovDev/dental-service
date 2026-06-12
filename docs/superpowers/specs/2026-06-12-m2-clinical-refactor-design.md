# M2 yopilishi — clinical modul refactor (CLI-99)

> Sana: 2026-06-12 · Milestone: M2 — Backend Foundation · Issue: CLI-99 (parent CLI-93)
> Holat: tasdiqlangan design

## 1. Kontekst

M2 "Backend Foundation" milestone'ining DB tomoni (CLI-93/94/95/96) **kod jihatdan to'liq tugagan** — audit (2026-06-12) buni tasdiqladi:

- `tenant_settings` jadval + FORCE RLS + tenant_id unique FK, `vertical`, `currency`, `reminder_lead_hours` — bor (`packages/db-schema/src/tables/tenant-settings.ts`, migration `apps/api/drizzle/0016_m2_foundation.sql`, RLS `apps/api/migrations/rls/0011_tenant_settings_rls.sql`)
- 2 FK constraint (`parent_transaction_id` → cashier_transactions, `replaced_by_id` → refresh_tokens) — bor
- 3 yetishmagan indeks (+1 bonus) — bor
- `patients` tag/source/insurance ustunlar — allaqachon bor (R2/CLI-38)

Linear'dagi "54%" raqami **eskirgan** (CLI-94 PR #16 merge bo'lgan, status yopilmagan).

**M2 da haqiqatda qolgan yagona real ish — CLI-99: clinical modulni RFC-0009 6-fayl/sub-domen arxitekturasiga bo'lish.**

## 2. Maqsad

`apps/api/src/modules/clinical/` ning monolit `clinical.service.ts` (356 qator, 4 concern aralash) ni 4 mustaqil sub-domenga bo'lish — **tashqi xulq-atvor (API path'lar, javoblar, RLS) o'zgarmasdan**.

Hozirgi struktura (4-fayl monolit):
```
clinical/
├── clinical.routes.ts   (135q, plain Hono)
├── clinical.service.ts  (356q, 4 concern)
├── clinical.schema.ts   (90q, plain Zod)
└── index.ts
```

4 concern: **diagnoses · treatment-plans · visit-notes · tooth-charts**.

## 3. Target arxitektura (sub-papka, RFC-0009 6-fayl)

Layout qarori (RFC-0009 §92 ochiq savolini hal qiladi): **sub-papka**.

```
modules/clinical/
├── clinical.routes.ts          # aggregator: 4 sub-route'ni mount qiladi (path'lar O'ZGARMAYDI)
├── index.ts                    # public eksport
├── treatment-plans/
│   ├── treatment-plans.routes.ts
│   ├── treatment-plans.service.ts
│   ├── treatment-plans.repository.ts
│   ├── treatment-plans.mapper.ts
│   ├── treatment-plans.schema.ts
│   └── index.ts
├── visit-notes/    (xuddi shu 6 fayl)
├── tooth-charts/   (xuddi shu 6 fayl)
└── diagnoses/      (xuddi shu 6 fayl)
```

Trivial CRUD sub-domenlarda mapper/repository yengil bo'lishi mumkin (RFC-0009 §2 pragmatik eslatma). `routes` qatlami plain Hono'da qoladi — zod-openapi migratsiyasi (CLI-92) BU ishga kirmaydi.

**CLI-92 dan mustaqillik:** audit tasdiqladi — sub-domen bo'linishi faqat service/repository/mapper/schema'ga tegadi, `OpenAPIHono`/`createRoute` talab qilmaydi. RFC-0009 §7 ularni birga qilishni *tavsiya* qiladi (routes'ni ikki marta qayta yozmaslik uchun), lekin bu **ketma-ketlik afzalligi, qattiq bog'liqlik emas**. CLI-99 plain Hono routes ustida ship qilinadi.

## 4. Fan-out strategiyasi — "create-only" parallel

4 sub-domen = 4 parallel agent, **worktree'siz**.

**Tamoyil (create-only):** har agent FAQAT o'zining yangi `clinical/<sub-domain>/*` fayllarini **yaratadi**. Eski `clinical.service.ts` / `clinical.schema.ts` ni faqat **o'qiydi** (nimani extract qilishni bilish uchun), umumiy fayllarga **tegmaydi**.

- Yozuvlar disjoint → git konflikt nolga teng → **worktree kerak emas** (oddiy parallel `Agent` chaqiruvlari yetarli).
- Aggregator `clinical.routes.ts` va `index.ts` ni **hech bir agent o'zgartirmaydi**.

**Integratsiya (bitta writer, parallel'dan keyin):**
1. `clinical.routes.ts` aggregatorni 4 yangi sub-route'ga ulash — barcha API path'lari verbatim saqlanadi.
2. `clinical/index.ts` ni yangilash.
3. Eski monolit `clinical.service.ts` + `clinical.schema.ts` ni o'chirish.
4. `app.ts` da mount nuqtasi (`app.route('/api', clinicalRoutes({ db, audit }))`) signaturasi o'zgarmaydi.

## 5. Safety net (fan-out'dan OLDIN — blocking)

clinical modulda hozir **hech qanday test yo'q**. Refactor xavfsizligi uchun safety net majburiy.

- Fan-out'dan **oldin** `tests/integration/clinical.test.ts` yoziladi (mavjud `tests/integration/*` pattern: real DB, `--env-file=../../.env`, vitest).
- Test 4 sub-domenning asosiy endpoint'larini (list/get/create) qamraydi, jumladan: treatment-plan yaratish (RLS tx), tooth-chart yaratish (RLS tx), visit-note yaratish (`deps.deductStock` yon ta'siri), diagnoses katalog (platform-level).
- Path'lar saqlangani uchun **before/after API javoblari bir xil bo'lishi shart** — bu invariant.

## 6. Majburiy RLS constraint'lar (har agent prompt'ida)

Bu nuqtalar uniform "6-fayl RLS shablonini qo'lla" ko'rsatmasi tomonidan buzilishi mumkin — shuning uchun har agent prompt'iga aniq yoziladi:

1. **`diagnoses` — platform-level.** Repository `deps.db` ni to'g'ridan-to'g'ri ishlatadi, `getDb(c)` EMAS. Tenant-scoped emas (platform katalogi). Uni RLS-bound qilish katalogni buzadi yoki bo'sh scope'ga tushiradi.
2. **`createPlan` (treatment-plans) va `createToothChart` (tooth-charts)** — ichida `db.transaction()` + manual `SELECT set_config('app.current_tenant_id', ...)` bor. Bu tranzaksiya + set_config repository qatlamiga **verbatim** ko'chiriladi.
3. **Qolgan RLS-bound operatsiyalar** `getDb(c)` ni saqlaydi.
4. `scripts/check-rls-coverage.ts` (CI lint) jadval-darajadagi FORCE RLS'ni mustaqil himoya qiladi — bu refactor'dan ta'sirlanmaydi.

## 7. Integratsiya gate (done mezoni)

Quyidagilar yashil bo'lmaguncha M2 yopilmaydi:
- `bun run build` (tsc --noEmit) — typecheck toza
- `clinical.test.ts` integration smoke test — yashil (before/after javob invarianti)
- api-client path'lari o'zgarmagani tasdiqlangan (`packages/api-client/src/endpoints.ts`)

## 8. Yon qarorlar

- **defaultLanguage ustuni — DEFERRED.** CLI-93 epic matnida aytilgan, lekin amalga oshirishda `vertical`/`currency`/`reminder` bilan cheklandi. Bu ataylab qoldirilgan qaror (unutilgan emas); kerak bo'lsa keyingi milestone'da `tenant_settings.default_language text DEFAULT 'uz'` + migration sifatida qo'shiladi.
- **CLI-94 status close** — kod tugagan (PR #16 merged), Linear statusini Done ga o'tkazish (trivial, refactor'dan keyin).

## 9. Build ketma-ketligi (yuqori daraja)

1. **Wave 0 (safety):** `clinical.test.ts` integration smoke test yozish + yashil ekanini tasdiqlash.
2. **Wave 1 (parallel create-only):** 4 agent — har biri `clinical/<sub-domain>/*` yaratadi. Umumiy fayllarga tegmaydi.
3. **Wave 2 (integratsiya):** aggregator routes/index ulash + eski monolit o'chirish + typecheck + smoke test.
4. **Wave 3 (yakuniy):** Linear CLI-99 + CLI-94 → Done; M2 yopildi.
