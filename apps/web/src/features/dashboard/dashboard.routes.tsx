import type { AppRoute } from '@/shell';
import { DashboardRouter } from './DashboardRouter';

// Index route — rol bo'yicha dashboard tanlaydi (perm darvozasiz; login bo'lsa hammaga)
export const dashboardRoutes: AppRoute[] = [{ path: '/', element: <DashboardRouter /> }];
