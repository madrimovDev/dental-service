import type { AppRoute } from '@/shell';
import { CalendarScreen } from './components/CalendarScreen';

export const appointmentRoutes: AppRoute[] = [
  { path: '/appointments', perm: 'appointment.view', element: <CalendarScreen /> },
];
