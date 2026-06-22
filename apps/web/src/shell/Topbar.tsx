import { IconButton } from '@dental/ui';
import { Burger, useMantineColorScheme } from '@mantine/core';
import { spotlight } from '@mantine/spotlight';
import { Moon, PanelLeft, Search, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NotificationBell } from '@/features/notifications/components/NotificationBell.tsx';
import { useUiStore } from '@/stores/ui-store.ts';
import classes from './Topbar.module.css';

export function Topbar({
  onBurger,
  burgerOpened,
}: {
  onBurger: () => void;
  burgerOpened: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const toggleSidebarRail = useUiStore((s) => s.toggleSidebarRail);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

  return (
    <div className={classes.bar}>
      <Burger opened={burgerOpened} onClick={onBurger} hiddenFrom="sm" size="sm" />

      <IconButton label={t('shell.toggle_sidebar')} onClick={toggleSidebarRail}>
        <PanelLeft />
      </IconButton>

      <button
        type="button"
        className={classes.search}
        onClick={() => spotlight.open()}
        aria-label={t('shell.search_placeholder')}
      >
        <Search />
        <span className={classes.searchInput}>{t('shell.search_placeholder')}</span>
        <span className={classes.kbd}>{isMac ? '⌘K' : 'Ctrl K'}</span>
      </button>

      <span className={classes.spacer} />

      <IconButton
        label={t(colorScheme === 'dark' ? 'shell.theme_light' : 'shell.theme_dark')}
        onClick={toggleColorScheme}
      >
        {colorScheme === 'dark' ? <Sun /> : <Moon />}
      </IconButton>

      <NotificationBell />

      <div className={classes.lang}>
        <button
          type="button"
          data-active={i18n.language !== 'ru'}
          aria-label={t('shell.lang_uz')}
          onClick={() => i18n.changeLanguage('uz')}
        >
          UZ
        </button>
        <button
          type="button"
          data-active={i18n.language === 'ru'}
          aria-label={t('shell.lang_ru')}
          onClick={() => i18n.changeLanguage('ru')}
        >
          RU
        </button>
      </div>
    </div>
  );
}
