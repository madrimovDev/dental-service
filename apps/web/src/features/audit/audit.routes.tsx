import type { AppRoute } from '@/shell';
import { AuditScreen } from './components/AuditScreen';

export const auditRoutes: AppRoute[] = [
  { path: '/audit', perm: 'audit_log.view', element: <AuditScreen /> },
];
