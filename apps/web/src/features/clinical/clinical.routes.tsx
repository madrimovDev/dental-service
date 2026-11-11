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
const LabOrderNewPage = lazy(() =>
  import('./components/lab-orders/LabOrderNewPage').then((m) => ({ default: m.LabOrderNewPage })),
);
const LabOrderDetailPage = lazy(() =>
  import('./components/lab-orders/LabOrderDetailPage').then((m) => ({
    default: m.LabOrderDetailPage,
  })),
);
const VisitNotePage = lazy(() =>
  import('./components/visit-notes/VisitNotePage').then((m) => ({ default: m.VisitNotePage })),
);
const RxScreen = lazy(() => import('./components/RxScreen').then((m) => ({ default: m.RxScreen })));

export const clinicalRoutes: AppRoute[] = [
  { path: '/patients/:id/visits/new', perm: 'medical_record.edit', element: <VisitNotePage /> },
  {
    path: '/patients/:id/visits/:visitId/edit',
    perm: 'medical_record.edit',
    element: <VisitNotePage />,
  },
  { path: '/plans', perm: 'medical_record.view', element: <TreatmentPlansScreen /> },
  { path: '/patients/:id/lab-orders/new', perm: 'lab_order.manage', element: <LabOrderNewPage /> },
  { path: '/lab-orders/:id', perm: 'lab_order.view', element: <LabOrderDetailPage /> },
  { path: '/lab', perm: 'lab_order.view', element: <LabOrdersScreen /> },
  { path: '/rx', perm: 'medical_record.view', element: <RxScreen /> },
];
