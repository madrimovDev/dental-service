import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const AuditScreen = lazy(() =>
  import('./components/AuditScreen').then((m) => ({ default: m.AuditScreen })),
);

export const auditRoutes: AppRoute[] = [
  { path: '/audit', perm: 'audit_log.view', element: <AuditScreen /> },
];
