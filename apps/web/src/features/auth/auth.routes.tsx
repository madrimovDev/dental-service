import type { AppRoute } from '@/shell';
import { ForgotPasswordPage } from './pages/forgot-password.page';
import { LoginPage } from './pages/login.page';
import { RegisterTenantPage } from './pages/register-tenant.page';
import { ResetPasswordPage } from './pages/reset-password.page';
import { SelectWorkspacePage } from './pages/select-workspace.page';

// Public route'lar — shell tashqarisida, perm darvozasiz (app/routes.tsx publicRoutes ga qo'yadi)
export const authRoutes: AppRoute[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/register-tenant', element: <RegisterTenantPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/select-workspace', element: <SelectWorkspacePage /> },
];
