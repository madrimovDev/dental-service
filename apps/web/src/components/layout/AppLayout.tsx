import {
  ActionIcon,
  AppShell,
  Avatar,
  Badge,
  Burger,
  Group,
  Menu,
  NavLink,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBuilding,
  IconCalendar,
  IconChevronDown,
  IconDashboard,
  IconLogout,
  IconRefresh,
  IconSettings,
  IconShieldLock,
  IconUsers,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

export function AppLayout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const [opened, { toggle }] = useDisclosure();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshToken, clear, hasPermission } = useAuthStore();

  const logout = async () => {
    if (refreshToken) {
      try {
        await api.auth.logout(refreshToken);
      } catch {
        // silent
      }
    }
    clear();
    navigate('/login');
  };

  const switchWorkspace = () => {
    navigate('/select-workspace');
  };

  const changeLanguage = (lng: 'uz' | 'ru') => {
    void i18n.changeLanguage(lng);
  };

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Title order={4}>🦷 {t('app.name')}</Title>
          </Group>

          <Group gap="xs">
            <Menu shadow="md" width={140}>
              <Menu.Target>
                <ActionIcon variant="subtle" size="lg">
                  <Text size="sm" fw={600}>
                    {i18n.language.toUpperCase()}
                  </Text>
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => changeLanguage('uz')}>O'zbek</Menu.Item>
                <Menu.Item onClick={() => changeLanguage('ru')}>Русский</Menu.Item>
              </Menu.Dropdown>
            </Menu>

            <Menu shadow="md" width={220}>
              <Menu.Target>
                <ActionIcon variant="subtle" size="lg">
                  <Group gap="xs">
                    <Avatar size="sm" radius="xl" color="teal">
                      {user?.fullName?.[0]?.toUpperCase() ?? '?'}
                    </Avatar>
                    <IconChevronDown size={16} />
                  </Group>
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{user?.fullName ?? user?.email}</Menu.Label>
                <Menu.Item leftSection={<IconRefresh size={16} />} onClick={switchWorkspace}>
                  {t('layout.switch_workspace')}
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item leftSection={<IconLogout size={16} />} onClick={logout} color="red">
                  {t('layout.logout')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap="xs">
          <NavLink
            component={Link}
            to="/"
            label={t('nav.dashboard')}
            leftSection={<IconDashboard size={20} />}
            active={location.pathname === '/'}
          />

          {/* M2+ — hozircha placeholder */}
          <NavLink
            label={t('nav.patients')}
            leftSection={<IconUsers size={20} />}
            disabled
            description={<Badge size="xs">M2</Badge>}
          />
          <NavLink
            label={t('nav.appointments')}
            leftSection={<IconCalendar size={20} />}
            disabled
            description={<Badge size="xs">M3</Badge>}
          />

          <NavLink
            label={t('nav.settings')}
            leftSection={<IconSettings size={20} />}
            childrenOffset={28}
            defaultOpened={location.pathname.startsWith('/settings')}
          >
            {hasPermission('tenant.view') && (
              <NavLink
                component={Link}
                to="/settings/tenant"
                label={t('nav.tenant_settings')}
                active={location.pathname === '/settings/tenant'}
              />
            )}
            {hasPermission('branch.view') && (
              <NavLink
                component={Link}
                to="/settings/branches"
                label={t('nav.branches')}
                leftSection={<IconBuilding size={16} />}
                active={location.pathname === '/settings/branches'}
              />
            )}
            {hasPermission('role.view') && (
              <NavLink
                component={Link}
                to="/settings/roles"
                label={t('nav.roles')}
                leftSection={<IconShieldLock size={16} />}
                active={location.pathname === '/settings/roles'}
              />
            )}
            {hasPermission('user.view') && (
              <NavLink
                component={Link}
                to="/settings/users"
                label={t('nav.users')}
                leftSection={<IconUsers size={16} />}
                active={location.pathname === '/settings/users'}
              />
            )}
          </NavLink>
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
