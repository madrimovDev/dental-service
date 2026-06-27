import type { AppRoute } from '@/shell';
import { LabOrdersScreen } from './components/lab-orders/LabOrdersScreen';
import { TreatmentPlansScreen } from './components/treatment-plans/TreatmentPlansScreen';

/**
 * DS7 — tenant-wide klinik ro'yxat ekranlari (barcha bemorlar bo'yicha). Bemor-scoped
 * tab'lar (PatientCard ichida) alohida; bular sidebar navigatsiyasidan ochiladi.
 */
export const clinicalRoutes: AppRoute[] = [
  { path: '/plans', perm: 'medical_record.view', element: <TreatmentPlansScreen /> },
  { path: '/lab', perm: 'lab_order.view', element: <LabOrdersScreen /> },
];
