import { PageHead, Tabs } from '@dental/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';

export type SettingsTab = 'tenant' | 'roles' | 'branches' | 'users';

const TAB_CONFIG: { id: SettingsTab; labelKey: string; path: string; permission: string }[] = [
  {
    id: 'tenant',
    labelKey: 'settings.nav_tenant',
    path: '/settings/tenant',
    permission: 'tenant.view',
  },
  { id: 'roles', labelKey: 'settings.nav_roles', path: '/settings/roles', permission: 'role.view' },
  {
    id: 'branches',
    labelKey: 'settings.nav_branches',
    path: '/settings/branches',
    permission: 'branch.view',
  },
  { id: 'users', labelKey: 'settings.nav_users', path: '/settings/users', permission: 'user.view' },
];

export function SettingsShell({
  active,
  actions,
  children,
}: {
  active: SettingsTab;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

  const visible = TAB_CONFIG.filter((tab) => hasPermission(tab.permission));

  return (
    <div style={{ padding: 24 }}>
      <PageHead title={t('settings.title')} subtitle={t('settings.subtitle')} actions={actions} />
      <div style={{ marginTop: 16, marginBottom: 24 }}>
        <Tabs
          value={active}
          onChange={(id) => {
            const tab = TAB_CONFIG.find((x) => x.id === id);
            if (tab) navigate(tab.path);
          }}
          variant="pill"
          items={visible.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        />
      </div>
      {children}
    </div>
  );
}
