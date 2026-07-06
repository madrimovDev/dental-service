# Route-level Lazy Loading — Design Spec

**Sana:** 2026-06-29  
**Holat:** Tasdiqlangan

---

## Maqsad

Barcha route-level sahifalarni (Screen/Page komponentlari) `React.lazy()` ga o'tkazish — initial bundle hajmini kamaytirish, birinchi yuklash tezligini oshirish.

---

## Joriy holat

- `app/routes.tsx` barcha 16 feature routes faylidan eager import qiladi
- Har `<feature>.routes.tsx` o'z Screen komponentini statik import qiladi
- Yagona lazy loading: `PatientCard.tsx` tab darajasida (mavjud pattern)
- Vite: vendor chunks (`react`, `mantine`, `icons`, `query`) ajratilgan, lekin app chunks yo'q

---

## Yondashuv: Distributed lazy (Approach A)

Har feature routes fayli o'z Screen importini `lazy()` ga o'zgartiradi. Tuzilma (`AppRoute` tipi, `App.tsx` logikasi) o'zgarmaydi.

---

## O'zgarishlar

### 1. `PageLoader` komponenti (yangi)

**Fayl:** `apps/web/src/shell/PageLoader.tsx`

```tsx
import { Center, Loader } from '@mantine/core';

export function PageLoader() {
  return (
    <Center h="60vh">
      <Loader />
    </Center>
  );
}
```

`apps/web/src/shell/index.ts` ga re-export qo'shiladi.

---

### 2. Suspense chegaralari

**`apps/web/src/shell/AppShell.tsx`** — `<Outlet>` atrofiga:

```tsx
import { Suspense } from 'react';
import { PageLoader } from './PageLoader';

// MantineAppShell.Main ichida:
<Suspense fallback={<PageLoader />}>
  <Outlet />
</Suspense>
```

Shell (sidebar, topbar) o'zgarmaydi — faqat kontent maydoni loading ko'rsatadi.

**`apps/web/src/app/App.tsx`** — public routes uchun:

```tsx
import { Suspense } from 'react';
import { PageLoader } from '@/shell';

// publicRoutes.map(...) atrofiga:
<Suspense fallback={<PageLoader />}>
  {publicRoutes.map(r => <Route key={r.path} path={r.path} element={r.element} />)}
</Suspense>
```

---

### 3. Feature routes fayllarida lazy pattern

Har faylda:
- `import { XScreen } from './components/XScreen'` → `const XScreen = lazy(() => import(...))`
- `import { lazy } from 'react'` qo'shiladi
- `AppRoute[]` tuzilmasi o'zgarmaydi

**Pattern (named export uchun):**
```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const ExpensesScreen = lazy(() =>
  import('./components/ExpensesScreen').then(m => ({ default: m.ExpensesScreen }))
);

export const expensesRoutes: AppRoute[] = [
  { path: '/expenses', perm: 'expense.view', element: <ExpensesScreen /> },
];
```

---

### 4. O'zgaradigan routes fayllar (16 ta)

| Fayl | Lazy bo'ladigon komponentlar |
|---|---|
| `auth/auth.routes.tsx` | `LoginPage`, `RegisterTenantPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `SelectWorkspacePage` |
| `dashboard/dashboard.routes.tsx` | `DashboardRouter` |
| `patients/patients.routes.tsx` | `PatientsListScreen`, `PatientNewScreen`, `PatientCard` |
| `appointments/appointments.routes.tsx` | `CalendarScreen` (+ boshqa appointment komponentlari) |
| `clinical/clinical.routes.tsx` | `TreatmentPlansScreen`, `LabOrdersScreen`, `RxScreen` |
| `cashier/cashier.routes.tsx` | `CashierScreen`, `TransactionsScreen` |
| `schedule/schedule.routes.tsx` | `ScheduleScreen` |
| `queue/queue.routes.tsx` | `QueueBoard`, `QueueDisplayBoard` |
| `recalls/recalls.routes.tsx` | `RecallDashboard` |
| `reports/reports.routes.tsx` | `ReportsScreen` |
| `audit/audit.routes.tsx` | `AuditScreen` |
| `expenses/expenses.routes.tsx` | `ExpensesScreen` |
| `stock/stock.routes.tsx` | `StockScreen` |
| `payroll/payroll.routes.tsx` | `PayrollScreen` |
| `settings/settings.routes.tsx` | 8 ta settings screen + `ServicesScreen`, `ServiceCategoriesScreen` |
| `profile/profile.routes.tsx` | profile komponentlari |

---

## Nima o'zgarmaydi

- `AppRoute` tipi (`shell/route.types.ts`)
- `app/routes.tsx` import/export logikasi
- `App.tsx` Route mapping logikasi (faqat Suspense qo'shiladi)
- `AppShell.tsx` layout (faqat Suspense qo'shiladi)
- Vite `manualChunks` konfiguratsiyasi

---

## Kutilgan natija

- Initial JS bundle: app kodi vendor-dan ajratilgan → kichikroq birinchi yuklash
- Har route navigatsiyada faqat kerakli chunk yuklanadi
- Vite build: har screen uchun alohida chunk fayli
- UX: sahifa almashinishida markazlashtirilgan `<Loader>` spinner (shell saqlanib turadi)
