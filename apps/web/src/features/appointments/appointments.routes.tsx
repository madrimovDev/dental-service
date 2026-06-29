import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const CalendarScreen = lazy(() =>
  import('./components/CalendarScreen').then((m) => ({ default: m.CalendarScreen })),
);

export const appointmentRoutes: AppRoute[] = [
  { path: '/appointments', perm: 'appointment.view', element: <CalendarScreen /> },
];
