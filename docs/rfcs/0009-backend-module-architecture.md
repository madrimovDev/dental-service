# RFC-0009: Backend modul arxitekturasi

- **Status:** Accepted
- **Sana:** 2026-06-09
- **Bog'liq:** [RFC-0001](./0001-extensibility-vertical-model.md), [RFC-0002 §4](./0002-frontend-architecture.md), CLAUDE.md §3.4–3.6, Linear CLI-82

## Kontekst

Yangi modullar (R3/R4: reports, inventory, expenses, payroll, notifications) va zod-openapi migratsiyasi (CLI-92) oldidan backend modul patternini qotirish kerak.

**Hozirgi holat:** har modul 4 fayl — `routes` / `service` / `schema` / `index`. Query'lar **service ichida** (alohida `queries.ts` yo'q). Service = factory(deps), DB `getDb(c)` (transaction-bound, RLS) orqali. Tenant izolyatsiya **faqat RLS** (qo'lda `tenantScopedQuery` helper YO'Q — CLAUDE.md uni va'da qilgan, lekin ishlatilmagan). `clinical` — 348q monolit (4 concern aralash).

⚠️ CLAUDE.md §3.5 (`queries.ts`) va §3.4 (`tenantScopedQuery` belt-and-suspenders) **realdan farq qiladi** — bu RFC realni qotiradi va kengaytiradi.

## Qaror

### 1. Kanonik modul strukturasi — 6 fayl, qatlamli

```
modules/<feature>/
├── index.ts                  # public eksport (routes factory + public tiplar)
├── <feature>.routes.ts       # HTTP qatlam: OpenAPIHono createRoute, middleware, ok/fail
├── <feature>.service.ts      # Biznes mantiq: factory(deps); repository+mapper orkestratsiya; audit
├── <feature>.repository.ts   # Ma'lumotga kirish: Drizzle query'lar, getDb(c) (RLS-bound), biznes mantiqsiz
├── <feature>.schema.ts       # Zod DTO (request/response) — zod-openapi OpenAPI manbasi
└── <feature>.mapper.ts       # Transformatsiya: DB row ↔ DTO/domain (PII mask, javob shakli, enum)
```

### 2. Qatlam mas'uliyatlari + bog'liqlik yo'nalishi

```
routes  →  service  →  repository
              ↘ mapper ↙
            schema (Zod, validatsiya + OpenAPI)
```
- **routes:** HTTP. Validatsiya (schema), middleware (auth/rls/perm), `ok()/fail()`. **DB'ga to'g'ridan tegmaydi.**
- **service:** biznes qoidalar, orkestratsiya, audit. Raw SQL yozmaydi (repository orqali).
- **repository:** faqat ma'lumotga kirish (Drizzle, `getDb(c)`). Biznes qoidasi yo'q.
- **mapper:** sof funksiyalar — persistence ↔ DTO (masalan `maskPii`, snake/camel, response shaping).
- **schema:** Zod — validatsiya va OpenAPI uchun yagona manba.

> **Pragmatik:** trivial CRUD modulda `repository`/`mapper` yengil (yoki minimal) bo'lishi mumkin, lekin struktura standart. Murakkab modulda har qatlam o'z faylida.

### 3. Tenant izolyatsiya — RLS-only + CI lint

- **RLS yagona qatlam:** repository `getDb(c)` (transaction-bound, `SET LOCAL app.current_tenant_id`) ishlatadi. Query'da explicit `WHERE tenant_id` **YO'Q** — Postgres RLS filtrlaydi.
- **"Ikkinchi qatlam" = `check-rls-coverage` CI lint** — har tenant-scoped jadval `FORCE RLS`'ga ega ekanini majburlaydi (DB audit: hozir to'liq). Bu — qo'lda per-query helper o'rniga, kompilyatsiya-vaqti kafolat.
- ⚠️ CLAUDE.md §3.4 shu qarorga yangilanadi (`tenantScopedQuery` helper bekor qilinadi).

### 4. DI — factory funksiyalar

- **service:** `createXService(deps: { audit, logger, ...providers })` → metodlar `(c, ...)`.
- **repository:** factory yoki sof funksiyalar `(c)`/`(db)` qabul qiladi (db = `getDb(c)`).
- **routes:** `xRoutes(deps)` → OpenAPIHono; `app.use` auth+rls; har route `requirePermission`.
- DB **dependency sifatida inject qilinmaydi** — kontekstdan (RLS).

### 5. HTTP qatlam — zod-openapi (RFC-0002 §4)

- `OpenAPIHono` + `createRoute` (method/path/request(Zod)/responses(Zod)).
- schema.ts Zod'lar OpenAPI manbasi → `generate:api-client`.
- Javob: `ok()`/`fail()` (@dental/core), izchil error shakli `{ error: { code, message } }`.
- Mutatsiyalarda `deps.audit` chaqiriladi.

### 6. Katta modullar va seam'lar

- **Sub-domenlarga bo'linadi.** `clinical` → `treatment-plans`, `visit-notes`, `tooth-charts`, `diagnoses` — har biri o'z service/repository/mapper/schema bilan, `clinical/` papkasi ostida (umumiy routes/index agregatsiya qiladi). "Fayl katta = ko'p ish qilyapti".
- **Seam izolyatsiya (RFC-0001):** dental seam modullari (clinical, lab, prescriptions, diagnoses) shu pattern, lekin core'dan ajratilgan (core ⇏ seam).

### 7. Migratsiya (incremental)

- **Yangi modullar** (R3/R4) — to'liq 6-fayl strukturada.
- **Mavjud modullar** (4-fayl) — **bosqichma-bosqich** konvergatsiya: zod-openapi migratsiyasi (CLI-92) yoki jiddiy o'zgarish paytida repository/mapper ajratiladi. **Big-bang refactor YO'Q.**

## Muqobillar (ko'rib chiqilgan)

1. **Hozirgi 4-fayl (query'lar service ichida).** ➖ Service biznes+persistence aralash; testlash qiyin; katta modulda monolit (clinical).
2. **To'liq DDD (entity/value-object/use-case qatlamlar).** ➖ Solo dev + CRUD-og'ir domen uchun ortiqcha.
3. **6-fayl qatlamli (tanlangan).** ✅ Aniq qatlamlar (routes/service/repository/mapper), testlanuvchan, katta modulni bo'ladi, lekin yengil.

## Oqibatlar

- ➕ Qatlamlar ajratilgan — repository/mapper mock qilinadi, service testlash oson.
- ➕ Katta modullar (clinical) tabiiy bo'linadi.
- ➕ zod-openapi + RLS-only izchil.
- ➖ Har modulda ko'proq fayl (trivial CRUD uchun biroz ortiqcha — mapper/repository yengil bo'lishi mumkin).
- ➖ Mavjud 17 modul yangi strukturaga ko'chirilishi kerak (incremental, CLI-92 bilan birga).
- 🔁 CLAUDE.md §3.4–3.6 shu RFC'ga yangilanadi.

## Ochiq savollar

- `repository` factory'mi yoki sof funksiyalar moduli? — Taklif: sof funksiyalar `(c, ...)`, service ulardan foydalanadi (yengilroq).
- clinical sub-domenlari alohida papkami (`clinical/treatment-plans/`) yoki bitta papkada fayl-prefiks? — Taklif: sub-papka (`clinical/<subdomain>/<subdomain>.{service,repository,...}.ts`).
