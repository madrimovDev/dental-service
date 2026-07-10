import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const ActivatePage = lazy(() =>
  import('./pages/activate.page').then((m) => ({ default: m.ActivatePage })),
);
const LoginPage = lazy(() => import('./pages/login.page').then((m) => ({ default: m.LoginPage })));
const RegisterTenantPage = lazy(() =>
  import('./pages/register-tenant.page').then((m) => ({ default: m.RegisterTenantPage })),
);
const ResetOwnerPasswordPage = lazy(() =>
  import('./pages/reset-owner-password.page').then((m) => ({ default: m.ResetOwnerPasswordPage })),
);
const SelectWorkspacePage = lazy(() =>
  import('./pages/select-workspace.page').then((m) => ({ default: m.SelectWorkspacePage })),
);

// Public route'lar — shell tashqarisida, perm darvozasiz (app/routes.tsx publicRoutes ga qo'yadi)
export const authRoutes: AppRoute[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/activate', element: <ActivatePage /> },
  { path: '/register-tenant', element: <RegisterTenantPage /> },
  { path: '/reset-owner-password', element: <ResetOwnerPasswordPage /> },
  { path: '/select-workspace', element: <SelectWorkspacePage /> },
];
