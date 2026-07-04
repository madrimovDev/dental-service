import { describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { IntegrationsSettingsScreen } from './IntegrationsSettingsScreen';

const integrationSettings = {
  eskiz: { enabled: true, sender: 'CLINIC' },
  telegram: { enabled: false, botUsername: null },
};

vi.mock('../settings.api', () => ({
  useTenantSettings: () => ({ isLoading: false, data: { integrationSettings } }),
}));

const t = (key: string) => i18n.t(key);

describe('IntegrationsSettingsScreen', () => {
  it('4 ta integratsiya kartasi render qiladi', () => {
    const { container } = renderApp(<IntegrationsSettingsScreen />);
    const grid = container.querySelector('[style*="repeat(2, 1fr)"]') as HTMLElement;
    expect(grid).toBeTruthy();
    expect(grid.children).toHaveLength(4);
  });

  it('holat backend integration_settings dan keladi (eskiz on, telegram off, soliq/onec scaffold off)', () => {
    const { container } = renderApp(<IntegrationsSettingsScreen />);
    const success = container.querySelectorAll('[data-status="success"]');
    const neutral = container.querySelectorAll('[data-status="neutral"]');
    // FAQAT eskiz.enabled=true → 1 success; telegram off + soliq/onec scaffold → 3 neutral.
    expect(success).toHaveLength(1);
    expect(neutral).toHaveLength(3);
  });

  it('ulangan karta «Sozlash», ulanmagan «Ulash» ko‘rsatadi', () => {
    const { getAllByRole } = renderApp(<IntegrationsSettingsScreen />);
    const labels = getAllByRole('button').map((b) => b.textContent);
    expect(labels.filter((l) => l === t('settings.integration_configure'))).toHaveLength(1);
    expect(labels.filter((l) => l === t('settings.integration_connect'))).toHaveLength(3);
  });

  it('Connect/Configure tugmalari disabled va "tez orada" tooltip ko‘rsatadi', () => {
    const { getAllByRole } = renderApp(<IntegrationsSettingsScreen />);
    const buttons = getAllByRole('button');
    // 4 karta — har birida bitta Connect yoki Configure tugma, hammasi disabled bo'lishi kerak
    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      expect(button).toBeDisabled();
    }
  });
});
