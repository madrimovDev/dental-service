# R2 — Xizmatlar katalogi (services): Design Spec

- **Sana:** 2026-06-11
- **Epik:** R2 / Linear CLI-36 (Xizmatlar katalogi + narx), Milestone M5
- **Bog'liq:** [RFC-0010](../../rfcs/0010-frontend-feature-architecture.md), [RFC-0009](../../rfcs/0009-backend-module-architecture.md), R2 etalon (`features/patients` · `features/appointments` · `features/queue`)
- **Status:** Approved (brainstorm), spec → plan'ga tayyor
- **Branch:** `feat/r2-services` (main'dan)

## Maqsad

Mavjud `apps/web/src/pages/settings/services.page.tsx` (CRUD katalog, jadval + modal + filial-narx) RFC-0010 `features/services/` ga ko'chiriladi + teal dizaynga re-skin. Backend kichik gap: **soft delete** (hard delete o'rniga). Mavjud-ammo-ko'rsatilmagan maydonlar (`requiredRole`, `descriptionUz/Ru`) formaga qo'shiladi.

## Qamrov

**Ichida:** `features/services/`, jadval kategoriya bo'yicha guruhlangan + qidiruv + kategoriya filter, edit modal 2 tab (Ma'lumot + Narxlar), soft-delete backend gap, `confirm()` → Mantine modal, i18n uz+ru.

**Tashqarida:**
- Kategoriya strukturasi (alohida jadval) → YO'Q, hozircha freetext `category` qoladi.
- Xizmat paketlari/komplekt → keyin.
- Narx tarixi → keyin.

## Qarorlar (brainstorm)

| # | Qaror | Asos |
|---|---|---|
| 1 | **Re-skin + backend gap** | Foydalanuvchi tanladi |
| 2 | **Soft delete** (`deletedAt` ustun + filter), hard delete o'rniga | Xizmat appointment/kassa/plan'da ishlatilsa tarix saqlanishi kerak |
| 3 | **Jadval, kategoriya bo'yicha guruhlangan** + qidiruv (nom/kod) + kategoriya filter | Katalog odatda uzun ro'yxat; zich ko'rinish |
| 4 | **Edit modal 2 tab:** Ma'lumot + Narxlar | Ko'p filialli klinikaga toza ajratish |
| 5 | **Mavjud maydonlar** (`requiredRole`, `descriptionUz/Ru`) formaga qo'shiladi | Schema'da bor, UI'da yo'q — backend o'zgarmaydi |

## 1. Backend gap — soft delete (RFC-0009)

### 1.1 Migratsiya
`services.deleted_at TIMESTAMPTZ NULL` ustun + index (`services_deleted_idx` ixtiyoriy — list filtri uchun). `drizzle-kit generate` → review → commit. Tenant-scoped (RLS yoqilgan).

### 1.2 `services.service.ts`
- **`remove`** — `db.delete(services)` o'rniga `db.update(services).set({ deletedAt: now }).where(eq(id))`. Audit `action: 'deleted'` saqlanadi.
- **`list`** — `where(isNull(services.deletedAt))` filtri qo'shiladi (mavjud `orderBy(category, nameUz)` saqlanadi).
- **`findById`** — soft-deleted'ni qaytarmaydi (yoki qaytaradi — detail uchun; lekin list'da yashirin). Plan'da: `findById` ham `deletedAt IS NULL`.
- `service-prices` jadvali tegmaydi (xizmat soft-deleted bo'lsa narxlar qoladi, lekin list'da xizmat ko'rinmaydi).

### 1.3 api-client
- `Service` tipiga `deletedAt: string | null` (agar list javobi to'liq qatorni qaytarsa). `remove` endpoint signature o'zgarmaydi (DELETE /:id hali soft-delete qiladi backend'da).

## 2. `features/services/` (kanonik RFC-0010)

```
apps/web/src/features/services/
├── index.ts
├── services.keys.ts        # serviceKeys.list / detail(id) / all
├── services.types.ts       # ServiceVM, CategoryGroup, ServiceFormValues
├── services.mappers.ts     # REAL (sof): groupByCategory(services) → CategoryGroup[]; service→ServiceVM
├── services.api.ts         # hooks: useServices / useServiceDetail / useUpsertService / useSetPrice / useDeleteService / useBranches
├── services.schema.ts      # form Zod (code/nameUz/nameRu/category/duration/requiredRole/description/isActive)
└── components/
    ├── ServicesScreen.tsx      # PageHead + qidiruv + kategoriya filter + guruhlangan jadval + "Yangi xizmat"
    ├── ServicesTable.tsx       # kategoriya bo'lim sarlavhalari bilan guruhlangan jadval satrlari
    ├── ServiceFormModal.tsx    # 2 tab (Tabs): InfoTab + PricesTab
    ├── ServiceInfoTab.tsx      # asosiy maydonlar (mantine-form)
    └── ServicePricesTab.tsx    # filial narxlari ro'yxati + qo'shish (faqat edit rejimida)
```

**Qatlam:** `components → services.api.ts (hooks) → api-client`. `services.mappers.ts` sof (kategoriya guruhlash + qidiruv filtri sof funksiya).

## 3. List UI (re-skin)

- **PageHead** + o'ng tomonda "Yangi xizmat" (`service.manage` gating).
- **Qidiruv** (TextInput, nom/kod bo'yicha sof filtr mapper'da) + **kategoriya filter** (Select, mavjud kategoriyalardan).
- **Jadval kategoriya bo'yicha guruhlangan:** har kategoriya bo'lim sarlavhasi (`category ?? "Boshqa"`) + ostida xizmatlar. Ustunlar: kod (Mono), nom (uz + ru kichik), davomiylik, status (StatusPill/Badge), amallar (edit/delete).
- **Delete:** `confirm()` o'rniga Mantine confirm modal (`@mantine/modals` yoki disclosure modal). `service.manage` gating.
- teal token, R0 primitivlar, lucide ikonkalar.

## 4. Edit modal — 2 tab

- **Tabs:** "Ma'lumot" + "Narxlar".
- **Ma'lumot tab** (`ServiceInfoTab`): `code` (create'da, edit'da disabled), `category`, `nameUz`*, `nameRu`, `durationMinutes`, `requiredRole` (Select: doctor/assistant/technician/—), `descriptionUz`, `descriptionRu`, `isActive`. `mantine-form` + zod resolver.
- **Narxlar tab** (`ServicePricesTab`): faqat **edit** rejimida faol (create'da "avval saqlang" yoki initial price). Filial narxlari ro'yxati + qo'shish formi (`useSetPrice`). Create rejimida — boshlang'ich narx + filial (mavjud xulq).
- Create vs edit: create modal narxlar tab'siz yoki disabled (xizmat hali yo'q).

## 5. i18n + R0 primitiv

- `services.*` namespace kengaytiriladi: tab nomlari (`tab_info`, `tab_prices`), qidiruv placeholder, `required_role` + variantlar, description labellari, soft-delete confirm matni → **uz + ru**. Mavjud `services.*` saqlanadi.
- R0: `PageHead`, `Button`, `TextInput`, `Select`, `NumberInput`, `Table`, `Tabs`, `Modal`, `Badge`/`StatusPill`, `Mono`.

## 6. Testlar

- **`services.mappers.test.ts`** (eng muhim): `groupByCategory` (kategoriyasiz → "Boshqa"; tartib), qidiruv filtri (nom/kod, case-insensitive).
- **`services.keys.test.ts`**: factory.
- **`ServiceFormModal`** behavioral: tab almashish; Ma'lumot saqlash → `upsert` chaqiruvi; edit'da Narxlar tab → `setPrice`.
- **`ServicesScreen`** smoke: render + qidiruv/filter mavjud.

## 7. Verifikatsiya

- `turbo test --filter @dental/web` + `@dental/api` typecheck + build + RLS lint.
- Migratsiya `db:generate` → review.
- Dev fidelity (inson): katalog guruhlangan, qidiruv/filter, create/edit 2 tab, filial narx qo'shish, soft delete (o'chirilgan xizmat ro'yxatdan yo'qoladi, lekin DB'da qoladi), requiredRole/description saqlanadi.

## Qurilish tartibi (plan'da)

1. Backend: migratsiya (`deletedAt`) → service (`remove` soft + `list`/`findById` filter) → api-client tip.
2. `features/services/` skelet: keys → types → mappers (+test) → api hooks → schema.
3. List UI: ServicesScreen + ServicesTable (guruhlash + qidiruv/filter) + smoke.
4. Form modal: ServiceFormModal + InfoTab + PricesTab + behavioral test.
5. i18n + yupqa page entry (`settings/services.page.tsx` → `<ServicesScreen />`).
6. Verifikatsiya.

## Ochiq mayda nuqtalar (plan'da)

- `findById` soft-deleted'ni qaytaradimi (detail/audit uchun) — plan'da `deletedAt IS NULL` deb qaror qilinadi.
- Create modalda Narxlar tab: disabled + "avval saqlang" hint vs boshlang'ich narx maydoni (mavjud xulq saqlanadi — Ma'lumot tab'da initial branch+price).
- Kategoriya filter manbai: mavjud xizmatlardan unique `category` yoki erkin kiritish.
