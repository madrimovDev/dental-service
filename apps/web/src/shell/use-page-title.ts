import { useLocation } from 'react-router-dom';
import { EXTRA_TITLE_KEYS, NAV_GROUPS } from './nav-config';

/**
 * Joriy yo'l (pathname) uchun sahifa sarlavhasi i18n KALITI.
 * Manba: `nav-config` element `path`↔`labelKey` (barcha asosiy ekran nav'da bor).
 * Mos kelmasa — `app.name` (masalan bemor kartasi `/patients/:id` kabi detail yo'llar).
 */
export function pageTitleKey(pathname: string): string {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.path === pathname) return item.labelKey;
    }
  }
  if (EXTRA_TITLE_KEYS[pathname]) return EXTRA_TITLE_KEYS[pathname];
  return 'app.name';
}

/** Topbar uchun: joriy route'ning sarlavha kaliti (`t()` bilan ko'rsatiladi). */
export function usePageTitle(): string {
  return pageTitleKey(useLocation().pathname);
}
