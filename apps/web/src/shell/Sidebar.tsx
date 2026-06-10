import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import { type NavItem, visibleGroups } from './nav-config';
import classes from './Sidebar.module.css';

function isActive(pathname: string, path: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function Sidebar() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const { pathname } = useLocation();
  const groups = visibleGroups(hasPermission);

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
        data-active={isActive(pathname, item.path)}
      >
        <Icon />
        {label}
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
