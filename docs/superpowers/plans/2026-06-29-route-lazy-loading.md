# Route-level Lazy Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Barcha route-level Screen/Page komponentlarini `React.lazy()` ga o'tkazish — initial bundle hajmini kamaytirish.

**Architecture:** Har `<feature>.routes.tsx` faylidagi statik importlar `lazy()` ga almashtiriladi. `PageLoader` komponenti yaratiladi va `AppShell.tsx` (`<Outlet>` atrofiga) hamda `App.tsx` (public routes) da `<Suspense>` chegaralari qo'shiladi. `AppRoute` tipi o'zgarmaydi.

**Tech Stack:** React 18 (`lazy`, `Suspense`), Vite (dynamic import → alohida chunk), Mantine v7 (`<Loader>`, `<Center>`), React Router 6 (`Outlet`)

## Global Constraints

- `AppRoute` tipi (`shell/route.types.ts`) o'zgarmaydi — `element: ReactNode` saqlanadi
- Har lazy import named export uchun: `.then(m => ({ default: m.ComponentName }))`
- `Loader` — Mantine `@mantine/core` dan; `Center` ham shu yerdan
- Typecheck: `bun run typecheck` (`apps/web/` dan yoki `bun --filter @dental/web typecheck`)
- Tests: `bun run test` (`apps/web/` dan)
- Biome lint: `bun run --filter @dental/web lint` (agar mavjud bo'lsa)

---

### Task 1: PageLoader + Suspense chegaralari

**Files:**
- Create: `apps/web/src/shell/PageLoader.tsx`
- Modify: `apps/web/src/shell/index.ts` (PageLoader export qo'shish)
- Modify: `apps/web/src/shell/AppShell.tsx` (Suspense + Outlet)
- Modify: `apps/web/src/app/App.tsx` (Suspense + public routes)

**Interfaces:**
- Produces: `PageLoader` — `() => JSX.Element`, Suspense fallback sifatida ishlatiladi

- [ ] **Step 1: `PageLoader` komponentini yoz**

`apps/web/src/shell/PageLoader.tsx` ni yarating:

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

- [ ] **Step 2: Shell index ga export qo'sh**

`apps/web/src/shell/index.ts` ni o'zgartiring:

```ts
export { AppShell } from './AppShell';
export { DesignSystemPage } from './DesignSystemPage';
export { ForbiddenPage } from './ForbiddenPage';
export { PageLoader } from './PageLoader';
export { RequirePermission } from './RequirePermission';
export type { AppRoute } from './route.types';
```

- [ ] **Step 3: `AppShell.tsx` ga Suspense qo'sh**

`apps/web/src/shell/AppShell.tsx` ni o'zgartiring — `<Outlet />` ni `<Suspense>` bilan o'rang:

```tsx
import { AppShell as MantineAppShell } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';
import { useUiStore } from '@/stores/ui-store.ts';
import { CommandPalette } from './CommandPalette';
import { PageLoader } from './PageLoader';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const [opened, { toggle }] = useDisclosure();
  const { t } = useTranslation();
  const rail = useUiStore((s) => s.sidebarRail);
  return (
    <MantineAppShell
      header={{ height: 62 }}
      navbar={{ width: rail ? 76 : 266, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <a href="#main-content" className="skip-link">
        {t('shell.skip_to_content')}
      </a>
      <CommandPalette />
      <MantineAppShell.Header>
        <Topbar onBurger={toggle} burgerOpened={opened} />
      </MantineAppShell.Header>
      <MantineAppShell.Navbar>
        <Sidebar />
      </MantineAppShell.Navbar>
      <MantineAppShell.Main id="main-content">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
```

- [ ] **Step 4: `App.tsx` ga Suspense qo'sh — public routes uchun**

`apps/web/src/app/App.tsx` ni o'zgartiring:

```tsx
import { cssVarsResolver, mantineTheme } from '@dental/ui';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { Suspense } from 'react';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute.tsx';
import { ErrorBoundary } from '@/components/ErrorBoundary.tsx';
import { i18n } from '@/lib/i18n.ts';
import { queryClient } from '@/lib/query-client.ts';
import { AppShell, PageLoader, RequirePermission } from '@/shell';
import { protectedRoutes, publicRoutes } from './routes.tsx';

export function App() {
  return (
    <MantineProvider
      theme={mantineTheme}
      cssVariablesResolver={cssVarsResolver}
      defaultColorScheme="light"
    >
      <Notifications position="top-right" />
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <ErrorBoundary>
              <Routes>
                {/* Public — shell tashqarisida */}
                <Route
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <Outlet />
                    </Suspense>
                  }
                >
                  {publicRoutes.map((r) => (
                    <Route key={r.path} path={r.path} element={r.element} />
                  ))}
                </Route>

                {/* Protected — AppShell layout, Outlet */}
                <Route
                  element={
                    <ProtectedRoute>
                      <AppShell />
                    </ProtectedRoute>
                  }
                >
                  {protectedRoutes.map((r) => (
                    <Route
                      key={r.path}
                      path={r.path}
                      element={
                        r.perm ? (
                          <RequirePermission perm={r.perm}>{r.element}</RequirePermission>
                        ) : (
                          r.element
                        )
                      }
                    />
                  ))}
                </Route>

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ErrorBoundary>
          </BrowserRouter>
        </QueryClientProvider>
      </I18nextProvider>
    </MantineProvider>
  );
}
```

> Eslatma: `Outlet` import qatoriga qo'shildi (hozirgi `App.tsx` da yo'q edi).

- [ ] **Step 5: Typecheck**

```bash
cd apps/web && bun run typecheck
```

Kutilgan: 0 xato

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/shell/PageLoader.tsx apps/web/src/shell/index.ts apps/web/src/shell/AppShell.tsx apps/web/src/app/App.tsx
git commit -m "feat(web): PageLoader + Suspense boundaries for lazy routes"
```

---

### Task 2: Oddiy bir-komponentli routes — lazy

`appointments`, `schedule`, `queue`, `recalls`, `reports`, `audit`, `expenses`, `stock`, `payroll`, `profile` — har birida bitta yoki ikki komponent.

**Files:**
- Modify: `apps/web/src/features/appointments/appointments.routes.tsx`
- Modify: `apps/web/src/features/schedule/schedule.routes.tsx`
- Modify: `apps/web/src/features/queue/queue.routes.tsx`
- Modify: `apps/web/src/features/recalls/recalls.routes.tsx`
- Modify: `apps/web/src/features/reports/reports.routes.tsx`
- Modify: `apps/web/src/features/audit/audit.routes.tsx`
- Modify: `apps/web/src/features/expenses/expenses.routes.tsx`
- Modify: `apps/web/src/features/stock/stock.routes.tsx`
- Modify: `apps/web/src/features/payroll/payroll.routes.tsx`
- Modify: `apps/web/src/features/profile/profile.routes.tsx`

**Interfaces:**
- Consumes: `AppRoute` tipi (`@/shell`)
- Produces: Har feature o'z lazy komponentlarini eksport qiladi (tashqi interfeys o'zgarmaydi)

- [ ] **Step 1: `appointments.routes.tsx` — lazy**

```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const CalendarScreen = lazy(() =>
  import('./components/CalendarScreen').then(m => ({ default: m.CalendarScreen }))
);

export const appointmentRoutes: AppRoute[] = [
  { path: '/appointments', perm: 'appointment.view', element: <CalendarScreen /> },
];
```

- [ ] **Step 2: `schedule.routes.tsx` — lazy**

```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const ScheduleScreen = lazy(() =>
  import('./components/ScheduleScreen').then(m => ({ default: m.ScheduleScreen }))
);

export const scheduleRoutes: AppRoute[] = [
  { path: '/schedule', perm: 'schedule.view', element: <ScheduleScreen /> },
];
```

- [ ] **Step 3: `queue.routes.tsx` — lazy**

```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const QueueBoard = lazy(() =>
  import('./components/QueueBoard').then(m => ({ default: m.QueueBoard }))
);
const QueueDisplayBoard = lazy(() =>
  import('./components/QueueDisplayBoard').then(m => ({ default: m.QueueDisplayBoard }))
);

export const queueRoutes: AppRoute[] = [
  { path: '/queue', perm: 'queue.view', element: <QueueBoard /> },
  { path: '/queue/board', perm: 'queue.view', element: <QueueDisplayBoard /> },
];
```

- [ ] **Step 4: `recalls.routes.tsx` — lazy**

```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const RecallDashboard = lazy(() =>
  import('./components/RecallDashboard').then(m => ({ default: m.RecallDashboard }))
);

export const recallRoutes: AppRoute[] = [
  { path: '/recalls', perm: 'recall.view', element: <RecallDashboard /> },
];
```

- [ ] **Step 5: `reports.routes.tsx` — lazy**

```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const ReportsScreen = lazy(() =>
  import('./components/ReportsScreen').then(m => ({ default: m.ReportsScreen }))
);

export const reportsRoutes: AppRoute[] = [
  { path: '/reports', perm: 'report.view', element: <ReportsScreen /> },
];
```

- [ ] **Step 6: `audit.routes.tsx` — lazy**

```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const AuditScreen = lazy(() =>
  import('./components/AuditScreen').then(m => ({ default: m.AuditScreen }))
);

export const auditRoutes: AppRoute[] = [
  { path: '/audit', perm: 'audit_log.view', element: <AuditScreen /> },
];
```

- [ ] **Step 7: `expenses.routes.tsx` — lazy**

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

- [ ] **Step 8: `stock.routes.tsx` — lazy**

```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const StockScreen = lazy(() =>
  import('./components/StockScreen').then(m => ({ default: m.StockScreen }))
);

export const stockRoutes: AppRoute[] = [
  { path: '/stock', perm: 'stock.view', element: <StockScreen /> },
];
```

- [ ] **Step 9: `payroll.routes.tsx` — lazy**

```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const PayrollScreen = lazy(() =>
  import('./components/PayrollScreen').then(m => ({ default: m.PayrollScreen }))
);

export const payrollRoutes: AppRoute[] = [
  { path: '/payroll', perm: 'payroll.view', element: <PayrollScreen /> },
];
```

- [ ] **Step 10: `profile.routes.tsx` — lazy**

```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const ProfilePage = lazy(() =>
  import('./pages/profile.page').then(m => ({ default: m.ProfilePage }))
);

export const profileRoutes: AppRoute[] = [
  { path: '/profile', element: <ProfilePage /> },
];
```

- [ ] **Step 11: Typecheck + tests**

```bash
cd apps/web && bun run typecheck && bun run test
```

Kutilgan: typecheck 0 xato, testlar yashil

- [ ] **Step 12: Commit**

```bash
git add \
  apps/web/src/features/appointments/appointments.routes.tsx \
  apps/web/src/features/schedule/schedule.routes.tsx \
  apps/web/src/features/queue/queue.routes.tsx \
  apps/web/src/features/recalls/recalls.routes.tsx \
  apps/web/src/features/reports/reports.routes.tsx \
  apps/web/src/features/audit/audit.routes.tsx \
  apps/web/src/features/expenses/expenses.routes.tsx \
  apps/web/src/features/stock/stock.routes.tsx \
  apps/web/src/features/payroll/payroll.routes.tsx \
  apps/web/src/features/profile/profile.routes.tsx
git commit -m "feat(web): lazy-load simple single-screen routes (10 features)"
```

---

### Task 3: Ko'p-komponentli routes — cashier + clinical + patients

**Files:**
- Modify: `apps/web/src/features/cashier/cashier.routes.tsx`
- Modify: `apps/web/src/features/clinical/clinical.routes.tsx`
- Modify: `apps/web/src/features/patients/patients.routes.tsx`

**Interfaces:**
- Consumes: `AppRoute` tipi (`@/shell`)

- [ ] **Step 1: `cashier.routes.tsx` — lazy**

```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const CashierScreen = lazy(() =>
  import('./components/CashierScreen').then(m => ({ default: m.CashierScreen }))
);
const TransactionsScreen = lazy(() =>
  import('./components/TransactionsScreen').then(m => ({ default: m.TransactionsScreen }))
);

export const cashierRoutes: AppRoute[] = [
  { path: '/cashier', perm: 'cashier.view', element: <CashierScreen /> },
  { path: '/transactions', perm: 'cashier.view', element: <TransactionsScreen /> },
];
```

- [ ] **Step 2: `clinical.routes.tsx` — lazy**

```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const TreatmentPlansScreen = lazy(() =>
  import('./components/treatment-plans/TreatmentPlansScreen').then(m => ({ default: m.TreatmentPlansScreen }))
);
const LabOrdersScreen = lazy(() =>
  import('./components/lab-orders/LabOrdersScreen').then(m => ({ default: m.LabOrdersScreen }))
);
const RxScreen = lazy(() =>
  import('./components/RxScreen').then(m => ({ default: m.RxScreen }))
);

export const clinicalRoutes: AppRoute[] = [
  { path: '/plans', perm: 'medical_record.view', element: <TreatmentPlansScreen /> },
  { path: '/lab', perm: 'lab_order.view', element: <LabOrdersScreen /> },
  { path: '/rx', perm: 'medical_record.view', element: <RxScreen /> },
];
```

- [ ] **Step 3: `patients.routes.tsx` — lazy**

`PatientCard` o'zi ichida tab-level lazy loading ni allaqachon qiladi — route darajasida ham lazy bo'lishi chunklashni yaxshilaydi.

```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const PatientsListScreen = lazy(() =>
  import('./components/PatientsListScreen').then(m => ({ default: m.PatientsListScreen }))
);
const PatientNewScreen = lazy(() =>
  import('./components/PatientNewScreen').then(m => ({ default: m.PatientNewScreen }))
);
const PatientCard = lazy(() =>
  import('./components/PatientCard').then(m => ({ default: m.PatientCard }))
);

export const patientRoutes: AppRoute[] = [
  { path: '/patients', perm: 'patient.view', element: <PatientsListScreen /> },
  { path: '/patients/new', perm: 'patient.create', element: <PatientNewScreen /> },
  { path: '/patients/:id', perm: 'patient.view', element: <PatientCard /> },
];
```

- [ ] **Step 4: Typecheck + tests**

```bash
cd apps/web && bun run typecheck && bun run test
```

Kutilgan: typecheck 0 xato, testlar yashil

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web/src/features/cashier/cashier.routes.tsx \
  apps/web/src/features/clinical/clinical.routes.tsx \
  apps/web/src/features/patients/patients.routes.tsx
git commit -m "feat(web): lazy-load cashier, clinical, patients routes"
```

---

### Task 4: Settings routes — lazy (cross-feature importlar bilan)

**Files:**
- Modify: `apps/web/src/features/settings/settings.routes.tsx`

`ServicesScreen` va `ServiceCategoriesScreen` — boshqa feature papkalaridan keladi; lazy import yo'li to'g'ridan-to'g'ri komponent fayliga yo'naltiriladi.

**Interfaces:**
- Consumes: `AppRoute` tipi (`@/shell`)

- [ ] **Step 1: `settings.routes.tsx` — lazy**

```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const ServicesScreen = lazy(() =>
  import('@/features/services/components/ServicesScreen').then(m => ({ default: m.ServicesScreen }))
);
const ServiceCategoriesScreen = lazy(() =>
  import('@/features/service-categories/components/ServiceCategoriesScreen').then(m => ({ default: m.ServiceCategoriesScreen }))
);
const BranchesSettingsScreen = lazy(() =>
  import('./components/BranchesSettingsScreen').then(m => ({ default: m.BranchesSettingsScreen }))
);
const IntegrationsSettingsScreen = lazy(() =>
  import('./components/IntegrationsSettingsScreen').then(m => ({ default: m.IntegrationsSettingsScreen }))
);
const NotificationsSettingsScreen = lazy(() =>
  import('./components/NotificationsSettingsScreen').then(m => ({ default: m.NotificationsSettingsScreen }))
);
const RolesSettingsScreen = lazy(() =>
  import('./components/RolesSettingsScreen').then(m => ({ default: m.RolesSettingsScreen }))
);
const TenantSettingsScreen = lazy(() =>
  import('./components/TenantSettingsScreen').then(m => ({ default: m.TenantSettingsScreen }))
);
const UsersSettingsScreen = lazy(() =>
  import('./components/UsersSettingsScreen').then(m => ({ default: m.UsersSettingsScreen }))
);

export const settingsRoutes: AppRoute[] = [
  { path: '/settings/services', perm: 'service.view', element: <ServicesScreen /> },
  { path: '/settings/service-categories', perm: 'service.view', element: <ServiceCategoriesScreen /> },
  { path: '/settings/tenant', perm: 'tenant.view', element: <TenantSettingsScreen /> },
  { path: '/settings/branches', perm: 'branch.view', element: <BranchesSettingsScreen /> },
  { path: '/settings/roles', perm: 'role.view', element: <RolesSettingsScreen /> },
  { path: '/settings/users', perm: 'user.view', element: <UsersSettingsScreen /> },
  { path: '/settings/notify', perm: 'tenant_settings.view', element: <NotificationsSettingsScreen /> },
  { path: '/settings/integrations', perm: 'tenant_settings.view', element: <IntegrationsSettingsScreen /> },
];
```

- [ ] **Step 2: Typecheck + tests**

```bash
cd apps/web && bun run typecheck && bun run test
```

Kutilgan: typecheck 0 xato, testlar yashil

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/settings/settings.routes.tsx
git commit -m "feat(web): lazy-load settings routes (8 screens + cross-feature)"
```

---

### Task 5: Auth + Dashboard routes — lazy

**Files:**
- Modify: `apps/web/src/features/auth/auth.routes.tsx`
- Modify: `apps/web/src/features/dashboard/dashboard.routes.tsx`

`DashboardRouter` — feature papkasining root da (`./DashboardRouter`). Auth pages — `./pages/` papkasida, `.page` suffixli.

**Interfaces:**
- Consumes: `AppRoute` tipi (`@/shell`)

- [ ] **Step 1: `auth.routes.tsx` — lazy**

```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const ForgotPasswordPage = lazy(() =>
  import('./pages/forgot-password.page').then(m => ({ default: m.ForgotPasswordPage }))
);
const LoginPage = lazy(() =>
  import('./pages/login.page').then(m => ({ default: m.LoginPage }))
);
const RegisterTenantPage = lazy(() =>
  import('./pages/register-tenant.page').then(m => ({ default: m.RegisterTenantPage }))
);
const ResetPasswordPage = lazy(() =>
  import('./pages/reset-password.page').then(m => ({ default: m.ResetPasswordPage }))
);
const SelectWorkspacePage = lazy(() =>
  import('./pages/select-workspace.page').then(m => ({ default: m.SelectWorkspacePage }))
);

export const authRoutes: AppRoute[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/register-tenant', element: <RegisterTenantPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/select-workspace', element: <SelectWorkspacePage /> },
];
```

- [ ] **Step 2: `dashboard.routes.tsx` — lazy**

```tsx
import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const DashboardRouter = lazy(() =>
  import('./DashboardRouter').then(m => ({ default: m.DashboardRouter }))
);

export const dashboardRoutes: AppRoute[] = [
  { path: '/', element: <DashboardRouter /> },
];
```

- [ ] **Step 3: Typecheck + tests**

```bash
cd apps/web && bun run typecheck && bun run test
```

Kutilgan: typecheck 0 xato, testlar yashil

- [ ] **Step 4: Yakuniy verify — build**

```bash
cd apps/web && bun run build
```

Kutilgan: build muvaffaqiyatli tugaydi; output da ko'p alohida `.js` chunk fayllar paydo bo'ladi (har screen uchun).

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web/src/features/auth/auth.routes.tsx \
  apps/web/src/features/dashboard/dashboard.routes.tsx
git commit -m "feat(web): lazy-load auth + dashboard routes — all routes now lazy"
```
