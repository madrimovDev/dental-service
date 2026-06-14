import type { AppRoute } from '@/shell';
import { CashierScreen } from './components/CashierScreen';

export const cashierRoutes: AppRoute[] = [
  { path: '/cashier', perm: 'cashier.view', element: <CashierScreen /> },
];
