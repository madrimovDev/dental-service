import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { NotificationsSettingsScreen } from './NotificationsSettingsScreen';

const updateMutate = vi.fn();
let canEdit = true;

const settingsData = {
  notificationSettings: {
    appointmentReminder: true,
    recallSms: false,
    paymentReceipt: false,
  },
};

vi.mock('../settings.api', () => ({
  useTenantSettings: () => ({ isLoading: false, data: settingsData }),
  useUpdateTenantSettings: () => ({ mutate: updateMutate, isPending: false }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => canEdit }),
}));

describe('NotificationsSettingsScreen', () => {
  afterEach(() => {
    vi.clearAllMocks();
    canEdit = true;
  });

  it('backend bilan mos 2 ta toggle render qiladi (appointment + recall)', () => {
    renderApp(<NotificationsSettingsScreen />);
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(2);
    // checked holati backend qiymatidan keladi.
    expect(switches[0]!.getAttribute('aria-checked')).toBe('true'); // appointmentReminder
    expect(switches[1]!.getAttribute('aria-checked')).toBe('false'); // recallSms
  });

  it('toggle bosilganda qisman PATCH chaqiriladi (joriy qiymat inkor qilinadi)', () => {
    renderApp(<NotificationsSettingsScreen />);
    fireEvent.click(screen.getAllByRole('switch')[1]!); // recallSms false → true
    expect(updateMutate).toHaveBeenCalledWith({ notificationSettings: { recallSms: true } });
  });

  it('tahrir ruxsati bo‘lmasa toggle disabled (mutate chaqirilmaydi)', () => {
    canEdit = false;
    renderApp(<NotificationsSettingsScreen />);
    const first = screen.getAllByRole('switch')[0]!;
    expect(first).toBeDisabled();
    fireEvent.click(first);
    expect(updateMutate).not.toHaveBeenCalled();
  });
});
