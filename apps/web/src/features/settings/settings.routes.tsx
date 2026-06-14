import { ServicesScreen } from '@/features/services';
import type { AppRoute } from '@/shell';
import { BranchesSettingsScreen } from './components/BranchesSettingsScreen';
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
];
