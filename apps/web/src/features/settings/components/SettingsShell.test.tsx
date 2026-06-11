import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { SettingsShell } from './SettingsShell';

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

describe('SettingsShell', () => {
  it("sub-nav 4 tab + sarlavhani ko'rsatadi", () => {
    renderApp(
      <SettingsShell active="roles">
        <div>content</div>
      </SettingsShell>,
    );
    expect(screen.getByText('Sozlamalar')).toBeInTheDocument();
    expect(screen.getByText('Klinika')).toBeInTheDocument();
    expect(screen.getByText('Rollar')).toBeInTheDocument();
    expect(screen.getByText('Filiallar')).toBeInTheDocument();
    expect(screen.getByText('Xodimlar')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
