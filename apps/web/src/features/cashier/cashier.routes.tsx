import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const CashierScreen = lazy(() =>
  import('./components/CashierScreen').then((m) => ({ default: m.CashierScreen })),
);
const TransactionsScreen = lazy(() =>
  import('./components/TransactionsScreen').then((m) => ({ default: m.TransactionsScreen })),
);

export const cashierRoutes: AppRoute[] = [
  { path: '/cashier', perm: 'cashier.view', element: <CashierScreen /> },
  { path: '/transactions', perm: 'cashier.view', element: <TransactionsScreen /> },
];
