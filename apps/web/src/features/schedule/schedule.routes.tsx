import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const ScheduleScreen = lazy(() =>
  import('./components/ScheduleScreen').then((m) => ({ default: m.ScheduleScreen })),
);

export const scheduleRoutes: AppRoute[] = [
  { path: '/schedule', perm: 'schedule.view', element: <ScheduleScreen /> },
];
