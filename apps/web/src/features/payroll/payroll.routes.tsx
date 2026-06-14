import type { AppRoute } from '@/shell';
import { PayrollScreen } from './components/PayrollScreen';

export const payrollRoutes: AppRoute[] = [
  { path: '/payroll', perm: 'payroll.view', element: <PayrollScreen /> },
];
