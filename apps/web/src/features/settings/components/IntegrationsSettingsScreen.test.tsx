import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { IntegrationsSettingsScreen } from './IntegrationsSettingsScreen';

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true, user: { id: 'me' } }),
}));

const t = (key: string) => i18n.t(key);

describe('IntegrationsSettingsScreen', () => {
  it('4 ta integratsiya kartasi render qiladi', () => {
    const { container } = renderApp(<IntegrationsSettingsScreen />);
    // Grid ichidagi kartalar = to'g'ridan-to'g'ri farzandlar (har biri radius-16 karta).
    const grid = container.querySelector('[style*="repeat(2, 1fr)"]') as HTMLElement;
    expect(grid).toBeTruthy();
    expect(grid.children).toHaveLength(4);
  });

  it("holatga ko'ra Sozlash / Ulash tugmalarini ko'rsatadi", () => {
    const { getAllByRole } = renderApp(<IntegrationsSettingsScreen />);
    const buttons = getAllByRole('button');
    const labels = buttons.map((b) => b.textContent);
    // 2 ulangan (Sozlash) + 2 ulanmagan (Ulash).
    const configure = labels.filter((l) => l === t('settings.integration_configure'));
    const connect = labels.filter((l) => l === t('settings.integration_connect'));
    expect(configure).toHaveLength(2);
    expect(connect).toHaveLength(2);
  });

  it('status pill ulangan=success, ulanmagan=neutral', () => {
    const { container } = renderApp(<IntegrationsSettingsScreen />);
    const success = container.querySelectorAll('[data-status="success"]');
    const neutral = container.querySelectorAll('[data-status="neutral"]');
    expect(success).toHaveLength(2);
    expect(neutral).toHaveLength(2);
  });

  it("tugmalar no-op (bosishda xato yo'q, navigatsiya yo'q)", () => {
    const { getAllByRole } = renderApp(<IntegrationsSettingsScreen />);
    const buttons = getAllByRole('button');
    // Hech qanday hook/endpoint/navigatsiya yo'q — bosish xato bermaydi.
    for (const b of buttons) {
      expect(() => fireEvent.click(b)).not.toThrow();
    }
  });
});
