import type { AppRoute } from '@/shell';
import { ExpensesScreen } from './components/ExpensesScreen';

export const expensesRoutes: AppRoute[] = [
  { path: '/expenses', perm: 'expense.view', element: <ExpensesScreen /> },
];
