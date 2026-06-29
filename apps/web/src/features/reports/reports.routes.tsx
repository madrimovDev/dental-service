import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const ReportsScreen = lazy(() =>
  import('./components/ReportsScreen').then((m) => ({ default: m.ReportsScreen })),
);

export const reportsRoutes: AppRoute[] = [
  { path: '/reports', perm: 'report.view', element: <ReportsScreen /> },
];
