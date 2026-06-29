import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const PayrollScreen = lazy(() =>
  import('./components/PayrollScreen').then((m) => ({ default: m.PayrollScreen })),
);

export const payrollRoutes: AppRoute[] = [
  { path: '/payroll', perm: 'payroll.view', element: <PayrollScreen /> },
];
