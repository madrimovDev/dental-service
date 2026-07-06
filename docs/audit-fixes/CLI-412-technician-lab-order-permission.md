# CLI-412 — Technician rol-shabloni `lab_order.view`siz — dashboard 403

> Audit: H8 (HIGH). CLI-153/M8 takrorlanuvchi RBAC-gap sinfi.

## 1. Muammo va ildiz sabab

`packages/core/src/role-templates.ts:242-252` — Technician shabloni:

```ts
{
  name: 'Technician',
  templateKey: 'technician',
  ...
  permissions: [
    'tenant.view',
    'branch.view',
    'patient.view',
    // M5 da: lab_order.view, lab_order.edit   ← qolib ketgan TODO
  ],
},
```

Technician'ning yagona landing'i `/` → `TechnicianDashboard` (`apps/web/src/features/dashboard/components/TechnicianDashboard.tsx:43`) `useActiveLabOrders()` chaqiradi. U `dashboard.api.ts:77-81`da `listLabOrders()` — ya'ni aynan `lab_order.view` bilan gate qilingan list endpoint (`apps/api/src/modules/lab-orders/lab-orders.routes.ts:45`: `requirePermission('lab_order.view')`).

Shablonda `lab_order.view` yo'q → Technician login qilishi bilan `GET /lab-orders` **403** → dashboard `isError` → error StateView (TechnicianDashboard.tsx:72-79). Lab nav yashirin, `/lab` route gated → **Technician personasi butun ishi uchun ishlamaydi**.

Permission katalogida kodlar **mavjud** (`packages/core/src/permissions.ts:335` `lab_order.view`, `:341` `lab_order.manage`) — shablon ularni bermayapti xolos. (Eski izohdagi `lab_order.edit` katalogда **yo'q**; to'g'ri kod `lab_order.manage`.)

## 2. Dizayn qarori

**DECISION (audit'dan): FAQAT SHABLON** — Technician shabloniga `lab_order.view` (+ `lab_order.manage`) qo'shamiz. **Mavjud tenantlar uchun data-migratsiya YOZILMAYDI.**

Sabab: `ROLE_TEMPLATES` faqat **yangi** tenant `registerTenant`da seed qilinadi (`apps/api/src/modules/auth/auth.service.ts:51`, `for (const template of ROLE_TEMPLATES)`). Mavjud tenantlarning `roles`/`role_permissions` yozuvlari shablonni **retroaktiv olmaydi** — bu ma'lum va qabul qilingan cheklov.

> ⚠️ **Ma'lum cheklov (spec majburiy hujjatlashtiradi):** Allaqachon seed qilingan tenantlarda Technician roli bugni **saqlaydi** — ularga `lab_order.view` avtomatik qo'shilmaydi. Bu tenantlar uchun **qo'lda rol tahriri** kerak (quyida qadamlar). Ixtiyoriy kelajakdagi backfill-migratsiya alohida ticket sifatida qoldiriladi.

**Graceful degrade (DECISION taklif qiladi):** `useActiveLabOrders()`ni `enabled: hasPermission('lab_order.view')` bilan gate qilamiz — shunda hali-bug-mavjud (seed qilingan) tenantlardagi Technician **error StateView** o'rniga **bo'sh ro'yxat** ko'radi. So'rov umuman yuborilmaydi → 403 toast/error yo'q.

**Rad etilgan alternativa:** *Barcha mavjud tenantlarga backfill-migratsiya* — audit va DECISION buni ataylab scope'dan chiqargan (least-surprise: tenant o'z rollarini tahrirlagan bo'lishi mumkin, shablon-driven backfill custom rollarga tegishi mumkin). Rad — bu ticketda emas.

## 3. Spec — tuzatilgandan keyingi xulq

Xulq-shartnoma:
- **Yangi tenant** (fix'dan keyin `registerTenant`) — Technician roli `lab_order.view` + `lab_order.manage` bilan seed qilinadi. Technician login → dashboard lab-orders ro'yxatini muvaffaqiyatli ko'radi (200), lab nav ochiq.
- **Mavjud tenant** — Technician roli o'zgarmaydi (bug saqlanadi), ammo dashboard **error StateView** o'rniga **bo'sh** ko'rsatadi (graceful degrade), 403 so'rov yuborilmaydi.
- **Vertical/feature gate ortogonal:** `lab-orders.routes.ts:45` `requireFeature('labOrders')` ham talab qiladi. Shablon fix'i **permission**ni tiklaydi, lekin endpoint hali ham `labOrders` feature (vertical) yoqilganini talab qiladi — bu to'g'ri. Shu sababli qabul mezoni "barcha verticalда ishlaydi" DEB DA'VO QILMAYDI.

Edge cases:
- `lab_order.view` bor lekin feature o'chirilgan (masalan "umumiy klinika" vertical) → 403 `feature.disabled` — kutilgan, bu ticket doirasida emas.
- Owner (superuser) — har doim ishlagan (permission bypass).

Test holatlari:
1. **(core, bun test)** `ROLE_TEMPLATES` ичida `technician` shabloni `lab_order.view` VA `lab_order.manage`ni o'z ichiga oladi.
2. **(core, bun test)** Har shablon permission'i katalogda mavjud kod (agar mavjud umumiy invariant testi bo'lsa — mustahkamlash).
3. **(web, vitest)** `hasPermission('lab_order.view') === false` bo'lganda `useActiveLabOrders` `enabled:false` (query yuborilmaydi) → dashboard bo'sh, error emas.

## 4. Implementatsiya rejasi (TDD)

**1-qadam — failing test (core):** `packages/core/src/role-templates.test.ts` yarat (yoki mavjud core test pattern — `license-signature.test.ts` idiomasi). Assert: `technician` template `permissions` `lab_order.view` va `lab_order.manage`ni o'z ichiga oladi.
Verify: `cd packages/core && bun test role-templates` → RED.

**2-qadam — impl (core):** `packages/core/src/role-templates.ts:246-251` — izohni almashtir:
```ts
permissions: [
  'tenant.view',
  'branch.view',
  'patient.view',
  'lab_order.view',
  'lab_order.manage',
],
```
Verify: `bun test role-templates` → GREEN; `bun run --filter @dental/core typecheck`.

**3-qadam — failing test (web graceful degrade):** `dashboard.api.test.ts` (mavjud) yoki yangi holat: `useActiveLabOrders` `hasPermission('lab_order.view')` false bo'lganда `enabled:false`. auth-store mock `hasPermission`ни false qaytaradigan qilib sozla, hook query'ni `disabled` holatда qoldirishini tekshir.
Verify: `cd apps/web && bunx vitest run dashboard.api` → RED.

**4-qadam — impl (web):** `apps/web/src/features/dashboard/dashboard.api.ts:77-81`:
```ts
export function useActiveLabOrders() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  return useQuery({
    queryKey: dashboardKeys.labOrders(),
    queryFn: () => listLabOrders().then((r) => r.data.data),
    enabled: hasPermission('lab_order.view'),
  });
}
```
`TechnicianDashboard.tsx`: `labOrders.isLoading`/`isError` shoxlar o'zgarmaydi — `enabled:false`da `isLoading=false, isError=false, data=undefined` → mavjud `MiniList` bo'sh (`emptyText`) yo'lini oladi. (Ixtiyoriy: `labOrders.isLoading` shartini `enabled` bilan mos qilib qoldirish yetarli.)
Verify: `bunx vitest run dashboard.api` → GREEN.

**5-qadam — verify:** `cd packages/core && bun test role-templates` + `cd apps/web && bunx vitest run dashboard.api` + har ikki paket typecheck.

## 5. Migratsiya / rollout / xavflar

- **DB migratsiya:** YO'Q (DECISION). Faqat yangi tenantlar to'g'ri seed oladi.
- **Mavjud tenant ta'siri:** Technician roli o'zgarmaydi — bug saqlanadi, lekin graceful degrade tufayli **error emas, bo'sh** ko'rinadi. Admin qo'lda tuzatishi mumkin.
  - **Qo'lda tuzatish qadamlari (admin uchun):** Sozlamalar → Rollar → *Technician* rolini oching → `lab_order.view` (va kerak bo'lsa `lab_order.manage`) ruxsatini belgilang → saqlang. (JWT yangilanishi max 15 daqiqa — §7 JWT staleness.)
- **Ixtiyoriy kelajak:** barcha mavjud tenantlarda `templateKey='technician'` system-rolga `lab_order.view` backfill-migratsiyasi — **alohida ticket** (bu ticketda emas).
- **RLS:** tegmaydi.
- **Xavf:** past — yangi ruxsat faqat Technician roliga qo'shiladi; graceful degrade regresssiyasiz.

## 6. Qabul mezonlari

- [ ] `technician` shabloni `lab_order.view` + `lab_order.manage`ga ega (core test yashil).
- [ ] Yangi tenant Technician login → dashboard lab-orders ro'yxatini 200 bilan ko'radi (feature yoqilgan vertical'da).
- [ ] `useActiveLabOrders` `lab_order.view`siz `enabled:false` — 403 so'rovi yuborilmaydi, dashboard bo'sh (error emas).
- [ ] Spec mavjud-tenant cheklovini + qo'lda tuzatish qadamlarini hujjatlaydi.
- [ ] Data-migratsiya YOZILMAGAN (DECISION).
- [ ] Typecheck + testlar toza.

## 7. Ta'sirlangan fayllar

- `packages/core/src/role-templates.ts` — Technician shabloniga `lab_order.view` + `lab_order.manage`.
- `packages/core/src/role-templates.test.ts` — **yangi** (yoki mavjud core test kengaytmasi).
- `apps/web/src/features/dashboard/dashboard.api.ts` — `useActiveLabOrders` `enabled` gate.
- `apps/web/src/features/dashboard/dashboard.api.test.ts` — graceful-degrade test.
