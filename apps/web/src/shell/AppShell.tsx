import { AppShell as MantineAppShell } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';
import { LicenseBanner } from '@/features/license';
import { useUiStore } from '@/stores/ui-store.ts';
import { CommandPalette } from './CommandPalette';
import { DesktopUpdateBanner } from './DesktopUpdateBanner';
import { PageLoader } from './PageLoader';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell() {
  const [opened, { toggle }] = useDisclosure();
  const { t } = useTranslation();
  const rail = useUiStore((s) => s.sidebarRail);
  return (
    <MantineAppShell
      header={{ height: 62 }}
      navbar={{ width: rail ? 76 : 266, breakpoint: 'sm', collapsed: { mobile: !opened } }}
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
        {/* Banner'lar header ICHIDA emas (u 62px qat'iy balandlikda — banner Topbar'ni
            qoplab qo'yardi): sarlavha ostida yopishib turadi, kontentni siljitadi. */}
        <div
          style={{
            position: 'sticky',
            top: 'var(--app-shell-header-offset, 0px)',
            zIndex: 10,
            margin: 'calc(-1 * var(--mantine-spacing-md)) calc(-1 * var(--mantine-spacing-md)) 0',
          }}
        >
          <LicenseBanner />
          <DesktopUpdateBanner />
        </div>
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </MantineAppShell.Main>
    </MantineAppShell>
  );
}
