import { AppShell as MantineAppShell } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const [opened, { toggle }] = useDisclosure();
  const { t } = useTranslation();
  return (
    <MantineAppShell
      header={{ height: 58 }}
      navbar={{ width: 244, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <a href="#main-content" className="skip-link">
        {t('shell.skip_to_content')}
      </a>
      <CommandPalette />
      <MantineAppShell.Header>
        <Topbar onBurger={toggle} burgerOpened={opened} />
      </MantineAppShell.Header>
      <MantineAppShell.Navbar>
        <Sidebar />
      </MantineAppShell.Navbar>
      <MantineAppShell.Main id="main-content">
        <Outlet />
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
