import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const RecallDashboard = lazy(() =>
  import('./components/RecallDashboard').then((m) => ({ default: m.RecallDashboard })),
);

export const recallRoutes: AppRoute[] = [
  { path: '/recalls', perm: 'recall.view', element: <RecallDashboard /> },
];
