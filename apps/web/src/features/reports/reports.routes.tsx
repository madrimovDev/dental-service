import type { AppRoute } from '@/shell';
import { ReportsScreen } from './components/ReportsScreen';

export const reportsRoutes: AppRoute[] = [
  { path: '/reports', perm: 'report.view', element: <ReportsScreen /> },
];
