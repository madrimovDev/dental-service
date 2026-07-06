import { lazy } from 'react';
import type { AppRoute } from '@/shell';

const ServicesScreen = lazy(() =>
  import('@/features/services/components/ServicesScreen').then((m) => ({
    default: m.ServicesScreen,
  })),
);
const ServiceCategoriesScreen = lazy(() =>
  import('@/features/service-categories/components/ServiceCategoriesScreen').then((m) => ({
    default: m.ServiceCategoriesScreen,
  })),
);
const BranchesSettingsScreen = lazy(() =>
  import('./components/BranchesSettingsScreen').then((m) => ({
    default: m.BranchesSettingsScreen,
  })),
);
const IntegrationsSettingsScreen = lazy(() =>
  import('./components/IntegrationsSettingsScreen').then((m) => ({
    default: m.IntegrationsSettingsScreen,
  })),
);
const NotificationsSettingsScreen = lazy(() =>
  import('./components/NotificationsSettingsScreen').then((m) => ({
    default: m.NotificationsSettingsScreen,
  })),
);
const RolesSettingsScreen = lazy(() =>
  import('./components/RolesSettingsScreen').then((m) => ({ default: m.RolesSettingsScreen })),
);
const TenantSettingsScreen = lazy(() =>
  import('./components/TenantSettingsScreen').then((m) => ({ default: m.TenantSettingsScreen })),
);
const UsersSettingsScreen = lazy(() =>
  import('./components/UsersSettingsScreen').then((m) => ({ default: m.UsersSettingsScreen })),
);

export const settingsRoutes: AppRoute[] = [
  // Xizmatlar katalogi /settings/* ostida; ekran `features/services` da
  { path: '/settings/services', perm: 'service.view', element: <ServicesScreen /> },
  {
    path: '/settings/service-categories',
    perm: 'service.view',
    element: <ServiceCategoriesScreen />,
  },
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
