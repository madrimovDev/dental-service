# RFC-0010: Frontend feature ichki arxitekturasi

- **Status:** Accepted
- **Sana:** 2026-06-09
- **Tuzatish (2026-06-14):** route registry feature ichiga ko'chirildi — har feature `<feature>.routes.tsx` da `AppRoute[]` eksport qiladi, `app/routes.tsx` ularni yig'adi. Alohida `apps/web/src/pages/` papkasi **bekor qilindi**; yupqa wrapper'lar o'chirildi (registry to'g'ridan Screen'ni ishlatadi), `pages/` subfolder faqat **real logikali** sahifalar uchun feature ichida (auth, profile). Quyida §1, §6 yangilangan.
- **Bog'liq:** [RFC-0002](./0002-frontend-architecture.md) (FE yuqori daraja), [RFC-0009](./0009-backend-module-architecture.md) (backend juftligi), [RFC-0003](./0003-design-system-theming.md), CLAUDE.md §5, M1/M4 (CLI), Linear CLI-82

## Kontekst

RFC-0002 frontend yuqori darajasini belgiladi (feature-folder, TanStack Query, Zustand, packages/ui, OpenAPI-generated client). Bu RFC **feature ichki strukturasini** detallashtiradi — backend RFC-0009 (6-fayl qatlamli modul) ning frontend juftligi.

**Hozirgi holat:** sahifalar hamma narsani qiladi (`useQuery`/`useMutation` inline, query-key ad-hoc `['patients', {...}]`, api-client bevosita). Feature-folder yo'q. `packages/api-client` qo'lda (RFC-0002 §4: OpenAPI-generated bilan almashtiriladi).

## Qaror

### 1. Kanonik feature strukturasi

```
apps/web/src/features/<feature>/
├── index.ts                  # public eksport (screen komponentlar, hooks, routes)
├── <feature>.routes.ts(x)    # route registry — AppRoute[] (path, perm?, element); app/routes.tsx yig'adi
├── <feature>.api.ts          # TanStack Query hooks (useXList, useX, useCreateX, useUpdateX…)
├── <feature>.keys.ts         # query-key factory
├── <feature>.schema.ts       # Zod form sxemalar (@mantine/form)
├── <feature>.mappers.ts      # DTO ↔ view-model (sof funksiyalar) — MAJBURIY qatlam
├── <feature>.types.ts        # view-model tiplar (xom DTO'lar generated api-client'dan)
├── pages/                    # IXTIYORIY — faqat real logikali sahifa (auth, profile). Yupqa wrapper YO'Q.
└── components/               # feature UI (ekranlar + sub-komponentlar)
```

> **Route registry:** `<feature>.routes.tsx` `AppRoute[]` (`{ path, element, perm? }`, tip `@/shell`) eksport qiladi. Yupqa feature `element`'da Screen'ni bevosita ishlatadi (`<CalendarScreen/>`), sahifa wrapper'i kerak emas. `perm` belgilangan bo'lsa `app/App.tsx` uni `RequirePermission` bilan o'raydi; aks holda darvozasiz (`/`, `/profile`, public auth). `app/routes.tsx` barcha feature registrylarini `publicRoutes` (shell tashqarisi) va `protectedRoutes` (AppShell ichi) ga yig'adi.

### 2. Qatlam mas'uliyatlari + bog'liqlik yo'nalishi

```
components  →  api.ts (Query hooks)  →  generated api-client
      ↘ mappers ↙           ↘ keys ↙
            schema (Zod, @mantine/form)
```
- **components:** UI. Feature hooks va mappers'dan foydalanadi. **api-client'ni bevosita chaqirmaydi, `fetch()` taqiqlanadi** (CLAUDE.md).
- **api.ts:** TanStack Query hooks — generated client'ni o'raydi. Query data'ni `mappers` orqali view-model'ga aylantiradi. `keys` factory'dan key oladi.
- **keys.ts:** query-key factory — `patientKeys.all`, `.list(params)`, `.detail(id)`. Izchil invalidatsiya (`qc.invalidateQueries({ queryKey: patientKeys.all })`).
- **mappers.ts:** sof funksiyalar — DTO ↔ view-model (narx format `2 400 000 so'm`, status→label/rang, derived maydonlar, sana format). Har feature'da bor (MAJBURIY — backend mapper'ga parallel). Trivial feature'da identity/yengil.
- **schema.ts:** Zod form sxemalar (`@mantine/form` + `mantine-form-zod-resolver`). Umumiy sxema `packages/core`'dan kelishi mumkin.
- **types.ts:** view-model tiplar. **Xom API DTO'lari generated `packages/api-client`'dan** (qo'lda yozilmaydi, RFC-0002 §4).

### 3. Query-key factory konvensiyasi

`[feature, scope, params]` — masalan `patientKeys.list({page,search})` → `['patients','list',{page,search}]`, `patientKeys.detail(id)` → `['patients','detail',id]`. Invalidatsiya `patientKeys.all` (`['patients']`) bo'yicha.

### 4. Data qatlam — feature hooks MAJBURIY

- Komponent faqat `<feature>.api.ts` hooks orqali data oladi (`usePatients`, `useCreatePatient`). api-client/`fetch` bevosita yo'q.
- Server state = Query, faqat. Cache/retry/invalidatsiya Query'da.

### 5. State — Zustand

- Global store'lar: `apps/web/src/stores/` (`auth`, `ui/shell`). Feature-lokal ephemeral holat — `useState` yoki kichik lokal store feature ichida.
- **Qoida:** server → Query; client/ephemeral → Zustand/useState. Server data Zustand'da dublirlanmaydi.

### 6. Routing, shared qatlamlar, dental seam

- **Routing (2026-06-14 tuzatish):** alohida `apps/web/src/pages/` papkasi **yo'q**. Har feature `<feature>.routes.tsx` da o'z route'larini eksport qiladi; `app/routes.tsx` ularni yig'adi, `app/App.tsx` map qiladi. Yupqa wrapper sahifalar **o'chirildi** — registry `element`'da Screen'ni bevosita ishlatadi. Faqat **real logikali** sahifa (auth formalari, profil) feature ichidagi `pages/` subfolder'da turadi. `AppRoute` tipi `@/shell` (faqat-type import, sikl yo'q). Tafsilot: yuqoridagi §1 izoh.
- **Shared:** `packages/ui` (dizayn-tizim primitivlari, RFC-0003) → `apps/web/src/components` (ilova-shared, masalan `PhoneInput`) → feature `components/`. Quyidan yuqoriga import.
- **Dental seam (RFC-0001):** `clinical`/`lab`/`prescriptions` feature'lari + `packages/odontogram` ajratilgan; core feature'lar import qilmaydi.

### 7. Katta kompozit ekran (patient-card)

`components/` ichida sub-papka, har tab alohida komponent, **lazy-loaded** (RFC-0002 §7). Dental tab'lar seam feature'laridan.

### 8. i18n

Har matn `t()`; uz **va** ru. Kalitlar feature namespace bo'yicha (`patients.*`). Dizayndan kelgan hardcoded matn darhol `t()`'ga.

## Muqobillar (ko'rib chiqilgan)

1. **Hozirgi "sahifa hamma narsani qiladi".** ❌ Masshtablashmaydi, query-key ad-hoc, test qiyin.
2. **Yengilroq (keys/mappers alohida emas).** ➖ Invalidatsiya izchil emas, transform komponentda tarqaladi.
3. **To'liq qatlamli (tanlangan).** ✅ Backend RFC-0009 ga parallel; testlanuvchan (hooks/mappers mock); izchil.

## Oqibatlar

- ➕ Backend ↔ frontend bir xil qatlamli falsafa; feature ichi bashoratli.
- ➕ mappers/keys/hooks mock qilinadi — komponent testlash oson.
- ➖ Har feature'da ko'proq fayl (trivial feature'da mapper/keys yengil — ortiqcha his, lekin izchillik evaziga).
- ➖ Mavjud `pages/`+`components/` feature-folder'ga ko'chiriladi (incremental, generated client migratsiyasi CLI-92 bilan).
- 🔁 CLAUDE.md §5 (Frontend) shu RFC'ga yangilanadi.

## Ochiq savollar

- Umumiy form sxemalar `packages/core`'da (FE+BE) yoki feature `schema.ts`'da? — Taklif: domen sxema `packages/core`, faqat-form variant feature'da.
