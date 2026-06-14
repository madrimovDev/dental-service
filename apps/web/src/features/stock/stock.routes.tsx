import type { AppRoute } from '@/shell';
import { StockScreen } from './components/StockScreen';

export const stockRoutes: AppRoute[] = [
  { path: '/stock', perm: 'stock.view', element: <StockScreen /> },
];
