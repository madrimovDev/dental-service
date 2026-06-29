import { appointmentRoutes } from '@/features/appointments';
import { auditRoutes } from '@/features/audit';
import { authRoutes } from '@/features/auth';
import { cashierRoutes } from '@/features/cashier';
import { clinicalRoutes } from '@/features/clinical';
import { dashboardRoutes } from '@/features/dashboard';
import { expensesRoutes } from '@/features/expenses';
import { patientRoutes } from '@/features/patients';
import { payrollRoutes } from '@/features/payroll';
import { profileRoutes } from '@/features/profile';
import { queueRoutes } from '@/features/queue';
import { recallRoutes } from '@/features/recalls';
import { reportsRoutes } from '@/features/reports';
import { scheduleRoutes } from '@/features/schedule';
import { settingsRoutes } from '@/features/settings';
import { stockRoutes } from '@/features/stock';
import { type AppRoute, DesignSystemPage, ForbiddenPage } from '@/shell';

/**
 * Route registry yig'uvchisi (RFC-0010 §6). Har feature `<feature>.routes.tsx` da o'z
 * route'larini eksport qiladi; bu yerda ular ikki guruhga yig'iladi:
 *  - publicRoutes    — shell tashqarisida (auth, dev/DS)
 *  - protectedRoutes — AppShell + ProtectedRoute ichida; `perm` bo'lsa RequirePermission o'raydi
 */

export const publicRoutes: AppRoute[] = [
  ...authRoutes,
  ...(import.meta.env.DEV ? [{ path: '/dev/ds', element: <DesignSystemPage /> }] : []),
];

export const protectedRoutes: AppRoute[] = [
  ...dashboardRoutes,
  ...patientRoutes,
  ...appointmentRoutes,
  ...scheduleRoutes,
  ...queueRoutes,
  ...recallRoutes,
  ...clinicalRoutes,
  ...cashierRoutes,
  ...reportsRoutes,
  ...auditRoutes,
  ...expensesRoutes,
  ...stockRoutes,
  ...payrollRoutes,
  ...settingsRoutes,
  ...profileRoutes,
  { path: '/403', element: <ForbiddenPage /> },
];
