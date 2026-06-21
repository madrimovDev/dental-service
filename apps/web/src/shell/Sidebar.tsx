import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { RecallNavBadge } from '@/features/recalls/components/RecallNavBadge.tsx';
import { useVertical } from '@/features/settings/settings.api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { type NavItem, visibleGroups } from './nav-config';
import classes from './Sidebar.module.css';

function isActive(pathname: string, path: string, allPaths: string[]): boolean {
  if (path === '/') return pathname === '/';
  if (pathname === path) return true;
  // Boshqa nav element shu yo'lni aniq egasi bo'lsa (masalan /patients/new), parent (/patients) yonmaydi
  if (allPaths.some((p) => p !== path && pathname === p)) return false;
  return pathname.startsWith(`${path}/`);
}

export function Sidebar() {
  const { t } = useTranslation();
  const { hasPermission, permissions } = useAuthStore();
  const { pathname } = useLocation();
  const vertical = useVertical();
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
          {label}
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
      >
        <Icon />
        {label}
        {item.key === 'recalls' && <RecallNavBadge />}
      </Link>
    );
  };

  return (
    <>
      <div className={classes.top}>
        <span className={classes.topLabel}>{t('app.name')}</span>
        <span className={classes.pin} />
      </div>
      <nav className={classes.scroll}>
        {groups.map((g) => (
          <div key={g.labelKey} className={classes.group}>
            <div className={classes.groupLabel}>{t(g.labelKey)}</div>
            {g.items.map(renderItem)}
          </div>
        ))}
      </nav>
    </>
  );
}
