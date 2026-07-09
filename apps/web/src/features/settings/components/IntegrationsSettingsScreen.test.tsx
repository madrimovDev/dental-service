import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { IntegrationsSettingsScreen } from './IntegrationsSettingsScreen';

const integrationSettings = {
  sms: { configured: true, hint: '••••INIC' },
  telegram: { configured: false, hint: null },
};

const updateSettingsMutate = vi.fn();
const testMutate = vi.fn();

vi.mock('../settings.api', () => ({
  useTenantSettings: () => ({ isLoading: false, data: { integrationSettings } }),
  useUpdateTenantSettings: () => ({ mutate: updateSettingsMutate, isPending: false }),
  useTestIntegration: () => ({ mutate: testMutate, isPending: false }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts);

describe('IntegrationsSettingsScreen', () => {
  it('Telegram va Eskiz kartalarini + soliq/1C scaffold kartalarini render qiladi', () => {
    renderApp(<IntegrationsSettingsScreen />);
    expect(screen.getByTestId('telegram-integration-card')).toBeInTheDocument();
    expect(screen.getByTestId('eskiz-integration-card')).toBeInTheDocument();
    expect(screen.getByText(t('settings.integration_soliq_name'))).toBeInTheDocument();
    expect(screen.getByText(t('settings.integration_onec_name'))).toBeInTheDocument();
  });

  it('sms.configured=true → Eskiz kartada "Ulangan" badge + hint; telegram off → "Ulanmagan"', () => {
    renderApp(<IntegrationsSettingsScreen />);
    const eskizCard = screen.getByTestId('eskiz-integration-card');
    expect(
      within(eskizCard).getByText(t('settings.integration_status_connected')),
    ).toBeInTheDocument();
    expect(
      within(eskizCard).getByText(t('settings.integration_configured_hint', { hint: '••••INIC' })),
    ).toBeInTheDocument();

    const telegramCard = screen.getByTestId('telegram-integration-card');
    expect(
      within(telegramCard).getByText(t('settings.integration_status_off')),
    ).toBeInTheDocument();
  });

  it('Eskiz forma to‘ldirilgach «Saqlash» bosilsa updateTenantSettings mutate({sms:{...}}) chaqiradi', () => {
    updateSettingsMutate.mockClear();
    renderApp(<IntegrationsSettingsScreen />);
    const eskizCard = screen.getByTestId('eskiz-integration-card');

    fireEvent.change(
      within(eskizCard).getByLabelText(t('settings.integration_eskiz_email_label')),
      {
        target: { value: 'clinic@example.com' },
      },
    );
    fireEvent.change(
      within(eskizCard).getByLabelText(t('settings.integration_eskiz_password_label')),
      { target: { value: 'secret-pass' } },
    );
    fireEvent.click(within(eskizCard).getByRole('button', { name: t('common.save') }));

    expect(updateSettingsMutate).toHaveBeenCalledWith({
      sms: { eskizEmail: 'clinic@example.com', eskizPassword: 'secret-pass' },
    });
  });

  it('Telegram forma bo‘sh holda «Tekshir» bosilsa validatsiya bloklaydi (mutate chaqirilmaydi)', () => {
    testMutate.mockClear();
    renderApp(<IntegrationsSettingsScreen />);
    const telegramCard = screen.getByTestId('telegram-integration-card');
    fireEvent.click(
      within(telegramCard).getByRole('button', { name: t('settings.integration_test_button') }),
    );
    expect(testMutate).not.toHaveBeenCalled();
  });

  it('Telegram token to‘ldirilgach «Tekshir» bosilsa testTenantIntegration mutate({target:telegram,...}) chaqiradi', () => {
    testMutate.mockClear();
    renderApp(<IntegrationsSettingsScreen />);
    const telegramCard = screen.getByTestId('telegram-integration-card');

    fireEvent.change(
      within(telegramCard).getByLabelText(t('settings.integration_telegram_bot_token_label')),
      { target: { value: '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' } },
    );
    fireEvent.click(
      within(telegramCard).getByRole('button', { name: t('settings.integration_test_button') }),
    );

    expect(testMutate).toHaveBeenCalledWith(
      {
        target: 'telegram',
        telegram: { botToken: '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
