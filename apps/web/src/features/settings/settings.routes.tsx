import { ServicesScreen } from '@/features/services';
import type { AppRoute } from '@/shell';
import { BranchesSettingsScreen } from './components/BranchesSettingsScreen';
import { IntegrationsSettingsScreen } from './components/IntegrationsSettingsScreen';
import { NotificationsSettingsScreen } from './components/NotificationsSettingsScreen';
import { RolesSettingsScreen } from './components/RolesSettingsScreen';
import { TenantSettingsScreen } from './components/TenantSettingsScreen';
import { UsersSettingsScreen } from './components/UsersSettingsScreen';

export const settingsRoutes: AppRoute[] = [
  // Xizmatlar katalogi /settings/* ostida; ekran `features/services` da
  { path: '/settings/services', perm: 'service.view', element: <ServicesScreen /> },
  { path: '/settings/tenant', perm: 'tenant.view', element: <TenantSettingsScreen /> },
  { path: '/settings/branches', perm: 'branch.view', element: <BranchesSettingsScreen /> },
  { path: '/settings/roles', perm: 'role.view', element: <RolesSettingsScreen /> },
  { path: '/settings/users', perm: 'user.view', element: <UsersSettingsScreen /> },
  {
    path: '/settings/notify',
    perm: 'tenant_settings.view',
    element: <NotificationsSettingsScreen />,
  },
  {
    path: '/settings/integrations',
    perm: 'tenant_settings.view',
    element: <IntegrationsSettingsScreen />,
  },
];
