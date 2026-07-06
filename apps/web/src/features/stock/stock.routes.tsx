import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const StockScreen = lazy(() =>
  import('./components/StockScreen').then((m) => ({ default: m.StockScreen })),
);

export const stockRoutes: AppRoute[] = [
  { path: '/stock', perm: 'stock.view', element: <StockScreen /> },
];
