import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const DashboardRouter = lazy(() =>
  import('./DashboardRouter').then((m) => ({ default: m.DashboardRouter })),
);

// Index route — rol bo'yicha dashboard tanlaydi (perm darvozasiz; login bo'lsa hammaga)
export const dashboardRoutes: AppRoute[] = [{ path: '/', element: <DashboardRouter /> }];
