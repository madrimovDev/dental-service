import type { AppRoute } from '@/shell';
import { CashierScreen } from './components/CashierScreen';
import { TransactionsScreen } from './components/TransactionsScreen';

export const cashierRoutes: AppRoute[] = [
  { path: '/cashier', perm: 'cashier.view', element: <CashierScreen /> },
  { path: '/transactions', perm: 'cashier.view', element: <TransactionsScreen /> },
];
