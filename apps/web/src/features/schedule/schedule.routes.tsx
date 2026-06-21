import type { AppRoute } from '@/shell';
import { ScheduleScreen } from './components/ScheduleScreen';

export const scheduleRoutes: AppRoute[] = [
  { path: '/schedule', perm: 'schedule.view', element: <ScheduleScreen /> },
];
