import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const ExpensesScreen = lazy(() =>
  import('./components/ExpensesScreen').then((m) => ({ default: m.ExpensesScreen })),
);

export const expensesRoutes: AppRoute[] = [
  { path: '/expenses', perm: 'expense.view', element: <ExpensesScreen /> },
];
