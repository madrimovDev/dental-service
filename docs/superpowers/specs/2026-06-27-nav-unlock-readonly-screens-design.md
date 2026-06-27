# Nav Unlock — Read-Only Aggregat Sahifalar (Dizayn / Spec)

> **Sana:** 2026-06-27
> **Scope:** `nav-config.ts`dagi 5 ta `disabled: true` nav item'ni yoqish va 4 ta yangi read-only screen yaratish.

---

## 1. Maqsad

`nav-config.ts`da 5 ta nav item `disabled: true` bilan belgilangan — ular faqat owner'ga ko'rinadi va bosilmaydi. Backend endpointlari va (plans/lab/rx uchun) patient-card taблari allaqachon tayyor. Bu spec ularni to'liq foydalanuvchan qiladi.

---

## 2. Scope

**5 ta nav item unlock:**

| Nav key | Path | Hozirgi holat | Kerakli ish |
|---------|------|---------------|------------|
| `kpi` | `/dashboard` | `disabled: true`, lekin route ishlaydi | faqat flag olib tashlash |
| `plans` | `/plans` | `disabled: true`, route yo'q | Screen + route + hook |
| `lab` | `/lab` | `disabled: true` + `feature: 'labOrders'`, route yo'q | Screen + route + hook |
| `rx` | `/rx` | `disabled: true`, route yo'q | Screen + route + hook |
| `transactions` | `/transactions` | `disabled: true`, route yo'q | Screen + route + hook |

**Scope DAN TASHQARI:** CRUD, create/edit modal, filtr, pagination, yangi backend endpoint. Faqat ko'rish.

---

## 3. Arxitektura

### 3.1 Yondashuv — thin read-only screens (B variant)

Har screen AuditScreen / ReportsScreen uslubida: `StateView` wrapper + Mantine `Table`. Mavjud patient-card tab komponentlariga tegmaydi (ular CRUD-heavy, standalone uchun mos emas).

### 3.2 Feature joylanishi

```
features/
├── clinical/
│   ├── components/
│   │   ├── PlansScreen.tsx       (yangi)
│   │   ├── LabScreen.tsx         (yangi)
│   │   └── RxScreen.tsx          (yangi)
│   ├── clinical.api.ts           (3 ta yangi hook qo'shiladi)
│   ├── clinical.routes.tsx       (yangi — RFC-0010 route registry)
│   └── index.ts                  (clinicalRoutes export qo'shiladi)
└── cashier/
    ├── components/
    │   └── TransactionsScreen.tsx (yangi)
    ├── cashier.api.ts             (1 ta yangi hook qo'shiladi)
    └── cashier.routes.tsx         (/transactions route qo'shiladi)
```

### 3.3 Ruxsatlar

| Screen | Permission | Izoh |
|--------|-----------|------|
| `/plans` | `medical_record.view` | backend `requirePermission` bilan mos |
| `/lab` | `medical_record.view` + vertical `labOrders` | `feature: 'labOrders'` saqlanadi |
| `/rx` | `medical_record.view` | — |
| `/transactions` | `cashier.view` | — |
| `/dashboard` | mavjud | o'zgarmaydi |

---

## 4. Yangi hooklar

Barcha generated client funksiyalar params'ni **optional** qabul qiladi — patientId bermasdan chaqirish tenant-wide ro'yxat qaytaradi (RLS filtrlaydi).

**`clinical.api.ts`ga qo'shiladigan hooklar:**

```ts
export function useAllTreatmentPlans() {
  return useQuery({
    queryKey: clinicalKeys.allPlans(),
    queryFn: () => listTreatmentPlans().then((r) => r.data),
  });
}

export function useAllLabOrders() {
  return useQuery({
    queryKey: clinicalKeys.allLabOrders(),
    queryFn: () => listLabOrders().then((r) => r.data),
  });
}

export function useAllPrescriptions() {
  return useQuery({
    queryKey: clinicalKeys.allPrescriptions(),
    queryFn: () => listPrescriptions().then((r) => r.data),
  });
}
```

**`cashier.api.ts`ga qo'shiladigan hook:**

```ts
export function useAllTransactions() {
  return useQuery({
    queryKey: cashierKeys.allTransactions(),
    queryFn: () => listCashierTransactions().then((r) => r.data),
  });
}
```

**Query key factory kengaytmalari (`clinical.keys.ts`, `cashier.keys.ts`):**
- `clinicalKeys.allPlans()` → `['clinical', 'plans']`
- `clinicalKeys.allLabOrders()` → `['clinical', 'labOrders']`
- `clinicalKeys.allPrescriptions()` → `['clinical', 'prescriptions']`
- `cashierKeys.allTransactions()` → `['cashier', 'transactions']`

---

## 5. Screen dizayni

Har screen uchun pattern:
```tsx
export function XxxScreen() {
  const { data, isLoading, isError } = useAllXxx();
  return (
    <StateView loading={isLoading} error={isError} empty={!data?.length}>
      <Table> ... </Table>
    </StateView>
  );
}
```

### PlansScreen — `/plans` (`medical_record.view`)
Ustunlar: **Sana** | **Bemor** (link `/patients/:id`) | **Bosqichlar soni** | **Jami narx** | **Holat** (StatusPill)

### LabScreen — `/lab` (`medical_record.view`, vertical `labOrders`)
Ustunlar: **Sana** | **Bemor** (link) | **Tur** | **Muddat** | **Holat** (StatusPill)

### RxScreen — `/rx` (`medical_record.view`)
Ustunlar: **Sana** | **Bemor** (link) | **Dorilar soni** | **Holat** (StatusPill)

### TransactionsScreen — `/transactions` (`cashier.view`)
Ustunlar: **Sana** | **Bemor** (link) | **Tur** | **Summa** (`formatCurrency`) | **To'lov usuli**

---

## 6. Routing o'zgarishlari

**Yangi `clinical.routes.tsx`:**
```tsx
export const clinicalRoutes: AppRoute[] = [
  { path: '/plans', perm: 'medical_record.view', element: <PlansScreen /> },
  { path: '/lab',   perm: 'medical_record.view', element: <LabScreen /> },
  { path: '/rx',    perm: 'medical_record.view', element: <RxScreen /> },
];
```

**`cashier.routes.tsx` qo'shimcha:**
```tsx
{ path: '/transactions', perm: 'cashier.view', element: <TransactionsScreen /> },
```

**`app/routes.tsx` — `clinicalRoutes` import + `protectedRoutes`ga qo'shish:**
```tsx
import { clinicalRoutes } from '@/features/clinical';
// ...
export const protectedRoutes: AppRoute[] = [
  ...clinicalRoutes,
  // ...mavjud routelar
];
```

**`nav-config.ts` — `disabled: true` olib tashlanadigan qatorlar:**
- Line 81: `plans`
- Line 88: `lab` (`feature: 'labOrders'` **SAQLANADI**)
- Line 90: `rx`
- Line 187: `kpi`
- Line 193: `transactions`

---

## 7. i18n

Yangi matn yo'q — mavjud nav kalitlar (`nav.plans`, `nav.lab`, `nav.rx`, `nav.kpi`, `nav.transactions`) allaqachon `uz.json`/`ru.json`da bor. Screen sarlavhalari uchun shu kalitlar qayta ishlatiladi.

---

## 8. Testlash va acceptance mezonlari

**Typecheck + biome:** `bunx turbo typecheck` + `bunx biome check` — 0 xato.

**Rendering:**
- Owner bo'lmagan foydalanuvchi (Doctor, Receptionist, Accountant) real permset bilan:
  - `/plans`, `/lab`, `/rx` — `medical_record.view` bo'lganda ko'rinadi, yo'q bo'lganda 403.
  - `/transactions` — `cashier.view` bo'lganda ko'rinadi.
  - `/lab` — `dental` vertical'da ko'rinadi, `general`da yo'q.
- Owner uchun: barcha 5 ta nav item bosiladi va to'g'ri sahifaga o'tadi.

**RBAC gap oldini olish:** har screen permission guard `perm` prop orqali `RequirePermission`'ga uzatiladi — qo'shimcha `hasPermission` check yozilmaydi.

---

## 9. Implementatsiya tartibi

1. `nav-config.ts` — 5 ta `disabled: true` olib tashlash
2. Query key factory kengaytmalari
3. Yangi hooklar (`clinical.api.ts`, `cashier.api.ts`)
4. 4 ta Screen komponenti
5. `clinical.routes.tsx` yaratish + `index.ts` export
6. `cashier.routes.tsx` + `app/routes.tsx` yangilash
7. Typecheck + biome verify
