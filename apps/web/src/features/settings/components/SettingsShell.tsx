import { VisuallyHidden } from '@mantine/core';
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useSettingsNavData } from '../settings.navData';
import type { NavPill } from '../settings.navPills';
import { type ReadinessKey, useTenantReadiness } from '../settings.readiness.api';

export type SettingsTab =
  | 'tenant'
  | 'roles'
  | 'branches'
  | 'users'
  | 'services'
  | 'notify'
  | 'integrations'
  | 'license'
  | 'backup';

// Klinika bo'limi: litsenziya tayyorligi (✓ yoki «sozlanmagan»).
const TENANT_READINESS: ReadinessKey[] = ['license'];

type TabConfig = {
  id: SettingsTab;
  labelKey: string;
  path: string;
  permission: string;
  /** Faqat desktopda ko'rinadigan bo'lim (bulutda yo'q). */
  desktopOnly?: 'license' | 'backup';
};

const TAB_CONFIG: TabConfig[] = [
  {
    id: 'tenant',
    labelKey: 'settings.nav_tenant',
    path: '/settings/tenant',
    permission: 'tenant_settings.view',
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
    id: 'services',
    labelKey: 'settings.nav_services',
    path: '/settings/services',
    permission: 'service.view',
  },
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
  {
    id: 'license',
    labelKey: 'settings.nav_license',
    path: '/settings/license',
    permission: 'tenant_settings.view',
    desktopOnly: 'license',
  },
  {
    id: 'backup',
    labelKey: 'settings.nav_backup',
    path: '/settings/backup',
    permission: 'tenant_settings.view',
    desktopOnly: 'backup',
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

const PILL_COLORS: Record<NavPill['tone'], { bg: string; fg: string }> = {
  ok: { bg: 'var(--success-soft, var(--primary-soft))', fg: 'var(--success)' },
  neutral: { bg: 'var(--surface-2)', fg: 'var(--ink-2)' },
  warn: { bg: 'var(--warning-soft, var(--surface-2))', fg: 'var(--warning)' },
  danger: { bg: 'var(--danger-soft, var(--surface-2))', fg: 'var(--danger)' },
};

/** Bo'lim yonidagi matnli belgi: ✓ / son / «1 muammo» / «3 kun» — rang yolg'iz emas. */
function NavPillBadge({ pill }: { pill: NavPill }) {
  const { t } = useTranslation();
  const label =
    pill.kind === 'ok'
      ? '✓'
      : pill.kind === 'count'
        ? String(pill.count)
        : pill.kind === 'issues'
          ? t('settingsShell.pill_issues', { count: pill.count })
          : pill.kind === 'days'
            ? t('settingsShell.pill_days', { count: pill.count })
            : pill.kind === 'no_prices'
              ? t('settingsShell.pill_no_prices')
              : pill.kind === 'no_channel'
                ? t('settingsShell.pill_no_channel')
                : pill.kind === 'todo'
                  ? t('settingsShell.todo')
                  : t('settingsShell.pill_never');
  const c = PILL_COLORS[pill.tone];
  return (
    <span
      data-testid={
        pill.kind === 'ok'
          ? 'tab-badge-ok'
          : pill.tone === 'neutral'
            ? 'tab-badge-count'
            : 'tab-badge-todo'
      }
      style={{
        flexShrink: 0,
        padding: '1px 8px',
        borderRadius: 99,
        fontSize: 11.5,
        fontWeight: 700,
        background: c.bg,
        color: c.fg,
      }}
    >
      {pill.kind === 'ok' ? (
        <>
          <span aria-hidden="true">{label}</span>
          <VisuallyHidden>{t('settingsShell.ready')}</VisuallyHidden>
        </>
      ) : (
        label
      )}
    </span>
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

  const canSeeReadiness = hasPermission('tenant_settings.view');
  const readiness = useTenantReadiness(canSeeReadiness);
  const items = readiness.data?.items ?? [];
  const okCount = items.filter((i) => i.ok).length;
  const nav = useSettingsNavData(items, hasPermission);
  const visible = TAB_CONFIG.filter((tab) => {
    if (!hasPermission(tab.permission)) return false;
    if (tab.desktopOnly === 'license') return nav.showLicense;
    if (tab.desktopOnly === 'backup') return nav.showBackup;
    return true;
  });
  const tabBadge = (tab: SettingsTab): ReactNode => {
    if (tab === 'tenant') {
      const rel = items.filter((i) => TENANT_READINESS.includes(i.key));
      if (rel.length === 0) return undefined;
      const ok = rel.every((i) => i.ok);
      return (
        <NavPillBadge pill={ok ? { tone: 'ok', kind: 'ok' } : { tone: 'warn', kind: 'todo' }} />
      );
    }
    const pill = nav.pills[tab];
    return pill ? <NavPillBadge pill={pill} /> : undefined;
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
      </div>
    </div>
  );
}
