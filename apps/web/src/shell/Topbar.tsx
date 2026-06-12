import { logout as apiLogout } from '@dental/api-client';
import { Avatar, IconButton } from '@dental/ui';
import { Burger, Menu, useMantineColorScheme } from '@mantine/core';
import { LogOut, Moon, Repeat, Search, Sun, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { NotificationBell } from '@/features/notifications/components/NotificationBell.tsx';
import { useAuthStore } from '@/stores/auth-store.ts';
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

      <search className={classes.search}>
        <Search />
        <input
          type="text"
          readOnly
          className={classes.searchInput}
          placeholder={t('shell.search_placeholder')}
          aria-label={t('shell.search_placeholder')}
        />
        <span className={classes.kbd}>⌘K</span>
      </search>

      <span className={classes.spacer} />

      <IconButton
        label={t(colorScheme === 'dark' ? 'shell.theme_light' : 'shell.theme_dark')}
        onClick={toggleColorScheme}
      >
        {colorScheme === 'dark' ? <Sun /> : <Moon />}
      </IconButton>

      <NotificationBell />

      <Menu shadow="md" width={140}>
        <Menu.Target>
          <button type="button" className={classes.lang} aria-label={t('common.language')}>
            <b>{i18n.language === 'ru' ? 'RU' : 'UZ'}</b>
            <span>{i18n.language === 'ru' ? 'UZ' : 'RU'}</span>
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={() => i18n.changeLanguage('uz')}>O'zbek</Menu.Item>
          <Menu.Item onClick={() => i18n.changeLanguage('ru')}>Русский</Menu.Item>
        </Menu.Dropdown>
      </Menu>

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
