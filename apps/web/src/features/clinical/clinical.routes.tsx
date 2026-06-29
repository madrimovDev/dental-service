import type { AppRoute } from '@/shell';
import { LabOrdersScreen } from './components/lab-orders/LabOrdersScreen';
import { RxScreen } from './components/RxScreen';
import { TreatmentPlansScreen } from './components/treatment-plans/TreatmentPlansScreen';

export const clinicalRoutes: AppRoute[] = [
  { path: '/plans', perm: 'medical_record.view', element: <TreatmentPlansScreen /> },
  { path: '/lab', perm: 'lab_order.view', element: <LabOrdersScreen /> },
  { path: '/rx', perm: 'medical_record.view', element: <RxScreen /> },
];
