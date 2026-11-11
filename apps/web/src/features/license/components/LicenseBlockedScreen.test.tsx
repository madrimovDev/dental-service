import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { LicenseBlockedScreen } from './LicenseBlockedScreen';

const recheck = vi.hoisted(() => vi.fn());
const getStatus = vi.hoisted(() => vi.fn());
vi.mock('@dental/api-client', async (orig) => ({
  ...(await orig<object>()),
  recheckLicense: recheck,
  getLicenseStatus: getStatus,
}));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<object>()),
  useNavigate: () => navigate,
}));

const res = (state: string) => ({
  success: true,
  data: { state, mode: 'desktop', daysLeft: null, expiresAt: null, graceEndsAt: null },
});

describe('LicenseBlockedScreen', () => {
  it('recheck active -> / ga otadi', async () => {
    recheck.mockResolvedValue(res('active'));
    renderApp(<LicenseBlockedScreen />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('license.blocked.recheck') }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
    expect(recheck).toHaveBeenCalled();
  });
  it('recheck expired -> stillExpired xabari', async () => {
    navigate.mockClear();
    recheck.mockResolvedValue(res('expired'));
    renderApp(<LicenseBlockedScreen />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('license.blocked.recheck') }));
    expect(await screen.findByText(i18n.t('license.blocked.stillExpired'))).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });
  it('SaaS (cloud): obuna matni, «internetga ulaning» yo‘q; recheck baribir ishlaydi', async () => {
    navigate.mockClear();
    getStatus.mockResolvedValue({
      success: true,
      data: { state: 'expired', mode: 'cloud', daysLeft: null, expiresAt: null, graceEndsAt: null },
    });
    recheck.mockResolvedValue({
      success: true,
      data: { state: 'active', mode: 'cloud', daysLeft: 30, expiresAt: null, graceEndsAt: null },
    });
    renderApp(<LicenseBlockedScreen />);
    expect(await screen.findByText(i18n.t('license.blocked.subscriptionTitle'))).toBeTruthy();
    expect(screen.queryByText(new RegExp(i18n.t('license.blocked.internet')))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('license.blocked.recheck') }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
  });
});
