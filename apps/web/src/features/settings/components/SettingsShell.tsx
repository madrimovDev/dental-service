import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';

export type SettingsTab = 'tenant' | 'roles' | 'branches' | 'users' | 'notify' | 'integrations';

const TAB_CONFIG: { id: SettingsTab; labelKey: string; path: string; permission: string }[] = [
  {
    id: 'tenant',
    labelKey: 'settings.nav_tenant',
    path: '/settings/tenant',
    permission: 'tenant.view',
  },
  {
    id: 'branches',
    labelKey: 'settings.nav_branches',
    path: '/settings/branches',
    permission: 'branch.view',
  },
  { id: 'roles', labelKey: 'settings.nav_roles', path: '/settings/roles', permission: 'role.view' },
  { id: 'users', labelKey: 'settings.nav_users', path: '/settings/users', permission: 'user.view' },
  {
    id: 'notify',
    labelKey: 'settings.nav_notify',
    path: '/settings/notify',
    permission: 'tenant_settings.view',
  },
  {
    id: 'integrations',
    labelKey: 'settings.nav_integrations',
    path: '/settings/integrations',
    permission: 'tenant_settings.view',
  },
];

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
  color: 'var(--ink-3)',
  padding: '4px 12px 8px',
};

function NavButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const base: CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '9px 12px',
    margin: '1px 0',
    border: 'none',
    borderRadius: 9,
    fontSize: 13.5,
    cursor: 'pointer',
  };

  const activeStyle: CSSProperties = {
    background: 'var(--primary-soft)',
    color: 'var(--primary)',
    fontWeight: 600,
  };

  const inactiveStyle: CSSProperties = {
    background: hovered ? 'var(--surface-2)' : 'transparent',
    color: hovered ? 'var(--ink)' : 'var(--ink-2)',
    fontWeight: 500,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...base, ...(isActive ? activeStyle : inactiveStyle) }}
    >
      {label}
    </button>
  );
}

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
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '212px minmax(0,1fr)',
        gap: 20,
        alignItems: 'start',
        animation: 'fadeUp .2s ease',
      }}
    >
      <nav style={{ position: 'sticky', top: 0 }}>
        <div style={eyebrowStyle}>{t('settings.title')}</div>
        {visible.map((tab) => (
          <NavButton
            key={tab.id}
            label={t(tab.labelKey)}
            isActive={tab.id === active}
            onClick={() => navigate(tab.path)}
          />
        ))}
      </nav>
      <div style={{ minWidth: 0 }}>
        {actions && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            {actions}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
