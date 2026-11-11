import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const CalendarScreen = lazy(() =>
  import('./components/CalendarScreen').then((m) => ({ default: m.CalendarScreen })),
);

const NewAppointmentScreen = lazy(() =>
  import('./components/NewAppointmentScreen').then((m) => ({ default: m.NewAppointmentScreen })),
);

export const appointmentRoutes: AppRoute[] = [
  { path: '/appointments', perm: 'appointment.view', element: <CalendarScreen /> },
  { path: '/appointments/new', perm: 'appointment.create', element: <NewAppointmentScreen /> },
];
