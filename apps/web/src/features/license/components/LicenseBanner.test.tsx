import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { LicenseBanner } from './LicenseBanner';

const status = vi.hoisted(() => ({ value: {} as { data?: unknown } }));
vi.mock('../license.api', () => ({ useLicenseStatus: () => status.value }));

const s = (state: string, daysLeft: number | null, mode = 'desktop') => ({
  data: { state, daysLeft, mode, expiresAt: null, graceEndsAt: null },
});

describe('LicenseBanner', () => {
  it('expiring -> sariq, kun soni bilan', () => {
    status.value = s('expiring', 10);
    renderApp(<LicenseBanner />);
    expect(screen.getByTestId('license-banner').textContent).toMatch(/10/);
  });
  it('grace -> qizil alert, yopish tugmasi yoq', () => {
    status.value = s('grace', 5);
    renderApp(<LicenseBanner />);
    expect(screen.getByRole('alert').textContent).toMatch(/5/);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('SaaS (cloud): expiring/grace — obuna matni, kun soni bilan, yopilmaydi', () => {
    status.value = s('expiring', 3, 'cloud');
    const { unmount } = renderApp(<LicenseBanner />);
    expect(screen.getByTestId('license-banner').textContent).toBe(
      i18n.t('license.banner.subscriptionExpiring', { count: 3 }),
    );
    unmount();
    status.value = s('grace', 2, 'cloud');
    renderApp(<LicenseBanner />);
    expect(screen.getByRole('alert').textContent).toBe(
      i18n.t('license.banner.subscriptionGrace', { count: 2 }),
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
  it.each([
    ['active', 30, 'desktop'],
    ['none', null, 'desktop'],
    ['none', null, 'cloud'],
    ['active', 40, 'cloud'],
  ])('%s/%s/%s -> hech narsa', (state, d, mode) => {
    status.value = s(state, d as number | null, mode);
    const { container } = renderApp(<LicenseBanner />);
    expect(container.querySelector('[data-testid="license-banner"]')).toBeNull();
  });
});
