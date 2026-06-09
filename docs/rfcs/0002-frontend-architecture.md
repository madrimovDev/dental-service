# RFC-0002: Frontend arxitektura

- **Status:** Accepted
- **Sana:** 2026-06-09
- **Bog'liq:** [RFC-0001](./0001-extensibility-vertical-model.md), [`docs/ux-ia-concept.md`](../ux-ia-concept.md), CLAUDE.md (frontend conventions), Linear CLI-85

## Kontekst

Redesign frontend'ni jiddiy qayta quradi (yangi shell + 30+ ekran). Kod yozishdan oldin frontend strukturasi va naqshlarini qotirish kerak.

**Hozirgi holat (`apps/web/src/`):**
- `pages/` (route komponentlari) + `components/{auth,clinical,layout}` — **feature-folder yo'q**, kod tur bo'yicha ajratilgan.
- `packages/ui` — **bo'sh placeholder** (dizayn-tizim komponent qatlami yo'q).
- `packages/api-client` — **qo'lda yozilgan** `types-*.ts` (per-milestone). ⚠️ CLAUDE.md "OpenAPI'dan auto-generated" deydi, lekin `@hono/zod-openapi` o'rnatilgan bo'lsa-da **ishlatilmagan** (createRoute/OpenAPIHono yo'q, generate script yo'q).
- State: Zustand (`stores/auth-store.ts`) + TanStack Query (`lib/query-client.ts`). Forms: `@mantine/form` + zod. i18n: `packages/i18n`.

30+ ekran va ko'p modul uchun bu struktura yetarli emas — feature'lar bo'yicha tashkil qilish kerak.

## Qaror

### 1. Monorepo frontend qatlamlari

| Paket | Mas'uliyat |
|---|---|
| `apps/web` | Ilova: routing, shell, feature'lar, sahifalar |
| `packages/ui` | **Dizayn-tizim primitivlari** (R0 chiqishi): Button, Card, Input, Tag, StatusPill, Tabs, StatCard… Biznes-mantiqsiz, themed. |
| `packages/api-client` | Tipli API client (pastga qarang) |
| `packages/core` | Umumiy tiplar, Zod sxemalar (FE+BE) |
| `packages/i18n` | uz/ru tarjimalar |
| `packages/odontogram` | **Dental seam** (RFC-0001) — FDI engine + UI, izolyatsiya |

**Bog'liqlik yo'nalishi:** `apps/web` → `packages/*`. `packages/ui` biznes paketlardan import qilmaydi.

### 2. `apps/web/src/` strukturasi — feature-folder

```
apps/web/src/
├── app/                    # App.tsx, router, providers (Query, Mantine, i18n)
├── shell/                  # Topbar + sidebar + rol-landing (RFC-0004)
├── features/<feature>/     # Biznes modullari (backend modullariga oyna)
│   ├── components/         # Feature UI
│   ├── api.ts              # TanStack Query hooks (useX, useXMutation) — feature bo'yicha
│   ├── forms/              # @mantine/form + zod
│   ├── <feature>.types.ts
│   └── index.ts
├── components/             # Ilova darajasidagi umumiy komponentlar (PhoneInput…)
├── lib/                    # api client instance, query-client, i18n init, helpers
├── stores/                 # Zustand (auth, ui/shell) — kichik, per-concern
├── theme/                  # Mantine theme (R0)
└── pages/                  # Yupqa route entry'lar (feature komponentini ulaydi)
```

**Feature ro'yxati** (backend modullariga mos): `patients`, `appointments`, `queue`, `cashier`, `services`, `clinical` (dental seam), `lab` (seam), `prescriptions` (seam), `consent`, `images`, `staff`, `roles`, `branches`, `reports`, `dashboards`, `settings`, `audit`, `inventory`, `expenses`, `payroll`, `notifications`.

**Dental seam izolyatsiyasi (RFC-0001):** `clinical`/`lab`/`prescriptions` feature'lari + `packages/odontogram` aniq chegaralangan; core feature'lar ulardan import qilmaydi.

### 3. Data fetching — TanStack Query

- **Yagona fetch chegarasi:** faqat `packages/api-client` orqali; `fetch()` to'g'ridan-to'g'ri taqiqlanadi (CLAUDE.md).
- **Query/mutation hooks** har feature'ning `api.ts` da joylashadi (`usePatients`, `useCreatePatient`).
- **Query key konvensiyasi:** `[feature, scope, params]` — masalan `['patients', 'list', { page, search }]`, `['patients', 'detail', id]`. Invalidatsiya feature prefiksi bo'yicha.
- **Server state = Query, faqat.** Cache, retry, invalidatsiya Query'da.

### 4. api-client: OpenAPI-generated (QAROR — A)

**Qaror:** `@hono/zod-openapi`ga to'liq o'tamiz — OpenAPI **single source of truth**, `packages/api-client` undan **avtomatik generatsiya** qilinadi. Qo'lda `types-*.ts` bekor qilinadi. Bu CLAUDE.md asl niyatiga mos; frontend tiplari drift qilmaydi.

**Pipeline:**
- Backend route'lar `@hono/zod-openapi` (`createRoute` + `OpenAPIHono`) bilan ro'yxatdan o'tadi; Zod sxemalar `packages/core`'da.
- `bun run generate:openapi` → OpenAPI spec; `bun run generate:api-client` → tipli React Query hooks (`packages/api-client`).
- Frontend faqat generatsiya qilingan client'ni import qiladi.

**Migratsiya (ataylab qabul qilingan upfront ish):** mavjud M1–M5 route'lari `@hono/zod-openapi`ga ko'chiriladi — bu **alohida foundational task** (R0 ostida, CLI). Yangi route'lar (R3/R4) boshidan zod-openapi bilan yoziladi. Migratsiya tugaguncha qo'lda `types-*.ts` vaqtincha qoladi, modul ko'chgani sayin o'chiriladi.

**Tanlanmagan muqobillar:** (B) qo'lda api-client — drift xavfi, foydalanuvchi rad etdi. (C) gibrid/cheksiz kechiktirish — qo'lda qism drift qilaveradi.

### 5. Client state — Zustand

- Kichik, per-concern store'lar: `auth` (mavjud), `ui/shell` (sidebar collapse, theme, active workspace ko'rinishi).
- **Qoida:** server state → Query; client/ephemeral (UI holati, sessiya) → Zustand. Server ma'lumotini Zustand'da dublirlash yo'q.

### 6. Forms, i18n, dizayn-tizim

- **Forms:** `@mantine/form` + `mantine-form-zod-resolver` (Zod 4). Sxemalar `packages/core` yoki feature `forms/` da.
- **i18n:** har matn `t()`; uz **va** ru. Dizayndan kelgan hardcoded uzbek matn ko'chirilganda darhol `t()`'ga o'tkaziladi (RFC review'da tez-tez unutiladi).
- **Dizayn-tizim:** `packages/ui` primitivlari (R0/RFC-0003). Feature'lar ulardan quriladi; xom Mantine'ni faqat primitiv yo'q joyda.

### 7. Patient card kompozitsiyasi (hub)

Bemor kartasi — eng katta kompozit ekran (10 tab). Har tab — alohida feature komponenti, **lazy-loaded** (`React.lazy` + Suspense). Dental tab'lar (odontogram, lab) seam feature'laridan; core tab'lar (umumiy, to'lovlar) core feature'lardan. Tab data faqat ochilganda fetch qilinadi.

## Muqobillar (ko'rib chiqilgan)

1. **Hozirgi pages+components'ni saqlash.** ❌ 30+ ekran uchun masshtablashmaydi; bog'liq kod tarqoq.
2. **Atomic design / type-based folder'lar.** ❌ Feature bog'liqligini buzadi; o'zgarish ko'p folder'ga tegadi.
3. **Feature-folder (tanlangan).** ✅ Backend modullariga oyna, yuqori kohezivlik, seam izolyatsiyasi tabiiy.

## Oqibatlar

- ➕ Backend ↔ frontend bir xil feature chegaralari — navigatsiya oson.
- ➕ Dental seam izolyatsiyasi struktura darajasida (RFC-0001).
- ➖ Mavjud `pages/`+`components/` kodni feature-folder'ga ko'chirish kerak (gibrid: yangi ekranlar feature-folder, eski asta ko'chadi).
- ➖ M1–M5 route'larini `@hono/zod-openapi`ga ko'chirish kerak (foundational task, R0) — upfront ish, lekin drift'siz tiplar evaziga.
- ➕ Backend ↔ frontend tiplari yagona manbadan; qo'lda sinxron yo'qoladi.

## Ochiq savollar

- `pages/` qatlamini saqlaymizmi (yupqa entry) yoki feature ichidan to'g'ridan route qilamizmi? — Taklif: yupqa `pages/` entry, feature mantig'i feature'da.
