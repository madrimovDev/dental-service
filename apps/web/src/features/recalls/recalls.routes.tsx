import type { AppRoute } from '@/shell';
import { RecallDashboard } from './components/RecallDashboard';

export const recallRoutes: AppRoute[] = [
  { path: '/recalls', perm: 'recall.view', element: <RecallDashboard /> },
];
