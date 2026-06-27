import type { AppRoute } from '@/shell';
import { LabScreen } from './components/LabScreen';
import { PlansScreen } from './components/PlansScreen';
import { RxScreen } from './components/RxScreen';

export const clinicalRoutes: AppRoute[] = [
  { path: '/plans', perm: 'medical_record.view', element: <PlansScreen /> },
  { path: '/lab', perm: 'medical_record.view', element: <LabScreen /> },
  { path: '/rx', perm: 'medical_record.view', element: <RxScreen /> },
];
