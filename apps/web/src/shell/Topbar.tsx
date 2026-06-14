import { logout as apiLogout } from '@dental/api-client';
import { Avatar, IconButton } from '@dental/ui';
import { Burger, Menu, useMantineColorScheme } from '@mantine/core';
import { spotlight } from '@mantine/spotlight';
import { LogOut, Moon, Repeat, Search, Sun, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { NotificationBell } from '@/features/notifications/components/NotificationBell.tsx';
import { useAuthStore } from '@/stores/auth-store.ts';
import { BranchSwitcher } from './BranchSwitcher.tsx';
import classes from './Topbar.module.css';

export function Topbar({
  onBurger,
  burgerOpened,
}: {
  onBurger: () => void;
  burgerOpened: boolean;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
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

  return (
    <div className={classes.bar}>
      <Burger opened={burgerOpened} onClick={onBurger} hiddenFrom="sm" size="sm" />

      <button type="button" className={classes.ws} onClick={() => navigate('/select-workspace')}>
        <span className={classes.wsLogo}>{t('app.name').charAt(0)}</span>
        <span className={classes.wsName}>
          <b>{t('app.name')}</b>
          <span>{user?.phone ?? ''}</span>
        </span>
      </button>

      <BranchSwitcher />

      <button
        type="button"
        className={classes.search}
        onClick={() => spotlight.open()}
        aria-label={t('shell.search_placeholder')}
      >
        <Search />
        <span className={classes.searchInput}>{t('shell.search_placeholder')}</span>
        <span className={classes.kbd}>⌘K</span>
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

      <Menu shadow="md" width={220}>
        <Menu.Target>
          <button type="button" className={classes.prof}>
            <Avatar name={user?.fullName ?? '?'} size="md" />
            <span className={classes.profName}>
              <b>{user?.fullName ?? user?.phone}</b>
              <span>{user?.phone}</span>
            </span>
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<User size={16} />} onClick={() => navigate('/profile')}>
            {t('profile.title')}
          </Menu.Item>
          <Menu.Item
            leftSection={<Repeat size={16} />}
            onClick={() => navigate('/select-workspace')}
          >
            {t('layout.switch_workspace')}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red" leftSection={<LogOut size={16} />} onClick={logout}>
            {t('layout.logout')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}
