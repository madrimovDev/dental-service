import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const TreatmentPlansScreen = lazy(() =>
  import('./components/treatment-plans/TreatmentPlansScreen').then((m) => ({
    default: m.TreatmentPlansScreen,
  })),
);
const LabOrdersScreen = lazy(() =>
  import('./components/lab-orders/LabOrdersScreen').then((m) => ({ default: m.LabOrdersScreen })),
);
const RxScreen = lazy(() => import('./components/RxScreen').then((m) => ({ default: m.RxScreen })));

export const clinicalRoutes: AppRoute[] = [
  { path: '/plans', perm: 'medical_record.view', element: <TreatmentPlansScreen /> },
  { path: '/lab', perm: 'lab_order.view', element: <LabOrdersScreen /> },
  { path: '/rx', perm: 'medical_record.view', element: <RxScreen /> },
];
