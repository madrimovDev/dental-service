import { logout as apiLogout } from '@dental/api-client';
import { Avatar } from '@dental/ui';
import { Menu } from '@mantine/core';
import { Building2, Check, ChevronDown, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useBranchSwitch, useWorkspaceBranches } from '@/features/auth';
import { RecallNavBadge } from '@/features/recalls/components/RecallNavBadge.tsx';
import { useVertical } from '@/features/settings/settings.api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useUiStore } from '@/stores/ui-store.ts';
import { type NavItem, visibleGroups } from './nav-config';
import classes from './Sidebar.module.css';

function isActive(pathname: string, path: string, allPaths: string[]): boolean {
  if (path === '/') return pathname === '/';
  if (pathname === path) return true;
  // Boshqa nav element shu yo'lni aniq egasi bo'lsa (masalan /patients/new), parent (/patients) yonmaydi
  if (allPaths.some((p) => p !== path && pathname === p)) return false;
  return pathname.startsWith(`${path}/`);
}

function SidebarWorkspaceSwitcher({ rail }: { rail: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeTenantId, activeBranchId, user } = useAuthStore();

  const branchesQuery = useWorkspaceBranches();
  const switchMut = useBranchSwitch();

  const clinicLetter = (user?.fullName ?? t('app.name')).charAt(0).toUpperCase();
  const data = branchesQuery.data;
  const totalChoices = (data?.branches.length ?? 0) + (data?.allowAllBranches ? 1 : 0);

  const currentBranchName = activeBranchId
    ? (data?.branches.find((b) => b.id === activeBranchId)?.name ?? t('shell.select_branch'))
    : t('shell.all_branches');

  const avatarEl = <span className={classes.wsAvatar}>{clinicLetter}</span>;

  // Narrow activeTenantId for branch-switch clicks — hasBranchChoice already guards nullability
  if (!data || totalChoices <= 1 || !activeTenantId) {
    // No branch choice — show plain workspace button (or rail avatar)
    if (rail) {
      return (
        <button
          type="button"
          className={classes.wsHeaderRail}
          onClick={() => navigate('/select-workspace')}
          aria-label={t('app.name')}
        >
          {avatarEl}
        </button>
      );
    }
    return (
      <button
        type="button"
        className={classes.wsHeader}
        onClick={() => navigate('/select-workspace')}
        aria-label={t('app.name')}
      >
        {avatarEl}
        <span className={classes.wsInfo}>
          <b data-testid="sidebar-clinic-name">{t('app.name')}</b>
        </span>
      </button>
    );
  }

  // Past this point: activeTenantId is string (non-null narrowed by guard above)
  const tenantId = activeTenantId;

  const branchMenuItems = (
    <>
      {data.allowAllBranches && (
        <Menu.Item
          leftSection={!activeBranchId ? <Check size={16} /> : <span style={{ width: 16 }} />}
          onClick={() => activeBranchId && switchMut.mutate({ tenantId })}
        >
          {t('shell.all_branches')}
        </Menu.Item>
      )}
      {data.branches.map((b) => (
        <Menu.Item
          key={b.id}
          leftSection={
            activeBranchId === b.id ? <Check size={16} /> : <span style={{ width: 16 }} />
          }
          onClick={() => activeBranchId !== b.id && switchMut.mutate({ tenantId, branchId: b.id })}
        >
          {b.name}
        </Menu.Item>
      ))}
    </>
  );

  if (rail) {
    return (
      <Menu shadow="md" width={220} position="bottom-start">
        <Menu.Target>
          <button
            type="button"
            className={classes.wsHeaderRail}
            aria-label={t('shell.select_branch')}
          >
            {avatarEl}
          </button>
        </Menu.Target>
        <Menu.Dropdown>{branchMenuItems}</Menu.Dropdown>
      </Menu>
    );
  }

  return (
    <Menu shadow="md" width={220} position="bottom-start">
      <Menu.Target>
        <button
          type="button"
          className={classes.wsHeader}
          disabled={switchMut.isPending}
          aria-label={t('shell.select_branch')}
        >
          {avatarEl}
          <span className={classes.wsInfo}>
            <b data-testid="sidebar-clinic-name">{t('app.name')}</b>
            <span className={classes.wsBranch}>
              <Building2 size={11} />
              {currentBranchName}
            </span>
          </span>
          <ChevronDown size={14} className={classes.wsChevron} />
        </button>
      </Menu.Target>
      <Menu.Dropdown>{branchMenuItems}</Menu.Dropdown>
    </Menu>
  );
}

function SidebarFooter({ rail }: { rail: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, refreshToken, clear } = useAuthStore();

  const logout = async () => {
    if (refreshToken) {
      try {
        await apiLogout({ refreshToken });
      } catch {
        /* silent */
      }
    }
    clear();
    navigate('/login');
  };

  if (rail) {
    return (
      <div className={classes.foot}>
        <Link to="/profile" className={classes.footProfileRail} aria-label={t('layout.profile')}>
          <Avatar name={user?.fullName ?? '?'} size="sm" />
        </Link>
        <button
          type="button"
          className={classes.footLogout}
          onClick={logout}
          aria-label={t('layout.logout')}
          data-testid="sidebar-logout"
        >
          <LogOut size={17} />
        </button>
      </div>
    );
  }

  return (
    <div className={classes.foot}>
      <Link to="/profile" className={classes.footProfile} aria-label={t('layout.profile')}>
        <Avatar name={user?.fullName ?? '?'} size="sm" />
        <span className={classes.footInfo}>
          <b>{user?.fullName ?? user?.phone}</b>
          <span>{user?.phone}</span>
        </span>
      </Link>
      <button
        type="button"
        className={classes.footLogout}
        onClick={logout}
        aria-label={t('layout.logout')}
        data-testid="sidebar-logout"
      >
        <LogOut size={17} />
      </button>
    </div>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const { hasPermission, permissions } = useAuthStore();
  const { pathname } = useLocation();
  const vertical = useVertical();
  const rail = useUiStore((s) => s.sidebarRail);
  const isOwner = permissions.includes('@owner');
  const groups = visibleGroups(hasPermission, vertical, isOwner);
  const allPaths = groups.flatMap((g) => g.items.filter((i) => !i.disabled).map((i) => i.path));

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const label = t(item.labelKey);
    if (item.disabled) {
      return (
        <span
          key={item.key}
          className={classes.item}
          aria-disabled="true"
          title={t('shell.coming_soon')}
        >
          <Icon />
          <span className={classes.label}>{label}</span>
          <span className={classes.soon}>{t('shell.coming_soon')}</span>
        </span>
      );
    }
    return (
      <Link
        key={item.key}
        to={item.path}
        className={classes.item}
        data-active={isActive(pathname, item.path, allPaths)}
        title={label}
      >
        <Icon />
        <span className={classes.label}>{label}</span>
        {item.key === 'recalls' && <RecallNavBadge />}
      </Link>
    );
  };

  return (
    <div className={classes.root} data-rail={rail ? 'true' : undefined}>
      <div className={classes.top}>
        <SidebarWorkspaceSwitcher rail={rail} />
      </div>
      <nav className={classes.scroll}>
        {groups.map((g) => (
          <div key={g.labelKey} className={classes.group}>
            <div className={classes.groupLabel}>{t(g.labelKey)}</div>
            {g.items.map(renderItem)}
          </div>
        ))}
      </nav>
      <SidebarFooter rail={rail} />
    </div>
  );
}
