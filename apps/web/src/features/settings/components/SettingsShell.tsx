import type { ComponentType, CSSProperties, ReactNode } from 'react';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import { type ReadinessKey, useTenantReadiness } from '../settings.readiness.api';

export type SettingsTab = 'tenant' | 'roles' | 'branches' | 'users' | 'notify' | 'integrations';

// Bo'lim yonidagi holat badge'i qaysi readiness elementiga bog'liq.
const TAB_READINESS: Partial<Record<SettingsTab, ReadinessKey[]>> = {
  tenant: ['license'],
  branches: ['workHours', 'doctorSchedule'],
  users: ['staff'],
  integrations: ['channel'],
};

// Lane D yaratadigan zaxira bo'limi — fayl bo'lmasa placeholder (import.meta.glob bo'sh qaytadi).
const backupModules = import.meta.glob('./BackupSettingsSection.tsx') as Record<
  string,
  () => Promise<{ BackupSettingsSection: ComponentType }>
>;
const backupLoader = backupModules['./BackupSettingsSection.tsx'];
const BackupSection: ComponentType | null = backupLoader
  ? lazy(() => backupLoader().then((m) => ({ default: m.BackupSettingsSection })))
  : null;

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

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid={ok ? 'tab-badge-ok' : 'tab-badge-todo'}
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        flexShrink: 0,
        background: ok ? 'var(--success)' : 'var(--warning)',
      }}
    />
  );
}

function NavButton({
  label,
  isActive,
  onClick,
  badge,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  badge?: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  const base: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
      <span>{label}</span>
      {badge}
    </button>
  );
}

function ReadinessCard({
  items,
  okCount,
  label,
}: {
  items: { key: ReadinessKey; ok: boolean }[];
  okCount: number;
  label: (k: ReadinessKey) => string;
}) {
  const { t } = useTranslation();
  const pct = Math.round((okCount / items.length) * 100);
  return (
    <section
      aria-label={t('settingsShell.readinessTitle')}
      style={{
        marginTop: 16,
        padding: 12,
        border: '1px solid var(--line)',
        borderRadius: 12,
        background: 'var(--surface)',
        fontSize: 12.5,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
        <span>{t('settingsShell.readinessTitle')}</span>
        <span data-testid="readiness-count">
          {t('settingsShell.readinessCount', { ok: okCount, total: items.length })}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-2)', margin: '8px 0' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 2,
            background: 'var(--primary)',
          }}
        />
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((i) => (
          <li
            key={i.key}
            style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0' }}
          >
            <StatusBadge ok={i.ok} label={t(i.ok ? 'settingsShell.ready' : 'settingsShell.todo')} />
            <span style={{ color: i.ok ? 'var(--ink-3)' : 'var(--ink)' }}>{label(i.key)}</span>
          </li>
        ))}
      </ul>
    </section>
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
  const canSeeReadiness = hasPermission('tenant_settings.view');
  const readiness = useTenantReadiness(canSeeReadiness);
  const items = readiness.data?.items ?? [];
  const okCount = items.filter((i) => i.ok).length;
  const hasBackup = items.some((i) => i.key === 'backup');
  const tabBadge = (tab: SettingsTab): ReactNode => {
    const keys = TAB_READINESS[tab];
    if (!keys) return undefined;
    const rel = items.filter((i) => keys.includes(i.key));
    if (rel.length === 0) return undefined;
    const ok = rel.every((i) => i.ok);
    return <StatusBadge ok={ok} label={t(ok ? 'settingsShell.ready' : 'settingsShell.todo')} />;
  };

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
            badge={tabBadge(tab.id)}
          />
        ))}
        {items.length > 0 && (
          <ReadinessCard
            items={items}
            okCount={okCount}
            label={(k) => t(`settingsShell.item_${k}`)}
          />
        )}
      </nav>
      <div style={{ minWidth: 0 }}>
        {actions && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            {actions}
          </div>
        )}
        {children}
        {hasBackup && active === 'tenant' && (
          <section aria-label={t('settingsShell.backupSection')} style={{ marginTop: 20 }}>
            {BackupSection ? (
              <Suspense fallback={null}>
                <BackupSection />
              </Suspense>
            ) : (
              <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>
                {t('settingsShell.backupPlaceholder')}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
