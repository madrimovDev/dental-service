import { Notifications, notifications } from '@mantine/notifications';
import { fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { DesktopServerConnectionCard } from './DesktopServerConnectionCard';

afterEach(() => {
  delete window.dentalDesktop;
  notifications.clean();
});

describe('DesktopServerConnectionCard', () => {
  it("window.dentalDesktop yo'q bo'lsa hech narsa render qilmaydi (brauzer build)", () => {
    const { container } = renderApp(<DesktopServerConnectionCard />);
    expect(container.querySelector('[data-testid="desktop-server-card"]')).toBeNull();
  });

  it("window.dentalDesktop mavjud bo'lsa input + tugma render qiladi", () => {
    window.dentalDesktop = {
      setServerUrl: async () => ({ ok: true, connected: true, serverUrl: 'x' }),
    };

    const { container, getByRole } = renderApp(<DesktopServerConnectionCard />);
    expect(container.querySelector('[data-testid="desktop-server-card"]')).not.toBeNull();
    expect(getByRole('textbox')).toBeTruthy();
    expect(getByRole('button')).toBeTruthy();
  });

  it("bo'sh URL bilan submit qilinsa setServerUrl chaqirilmaydi, xato ko'rinadi", async () => {
    const setServerUrl = vi.fn();
    window.dentalDesktop = { setServerUrl };

    const { getByRole, findByText } = renderApp(<DesktopServerConnectionCard />);
    fireEvent.click(getByRole('button'));

    await findByText(i18n.t('settings.desktop_server_url_required'));
    expect(setServerUrl).not.toHaveBeenCalled();
  });

  it("to'g'ri URL bilan submit qilinsa setServerUrl chaqiriladi va connected:true da muvaffaqiyat xabari chiqadi", async () => {
    const setServerUrl = vi
      .fn()
      .mockResolvedValue({ ok: true, connected: true, serverUrl: 'http://10.0.0.5:8001' });
    window.dentalDesktop = { setServerUrl };

    const { getByRole, findAllByText } = renderApp(
      <>
        <Notifications />
        <DesktopServerConnectionCard />
      </>,
    );
    fireEvent.change(getByRole('textbox'), { target: { value: 'http://10.0.0.5:8001' } });
    fireEvent.click(getByRole('button'));

    await waitFor(() => expect(setServerUrl).toHaveBeenCalledWith('http://10.0.0.5:8001'));
    expect(await findAllByText(i18n.t('settings.desktop_server_success'))).not.toHaveLength(0);
  });

  it('connected:false qaytsa "saqlandi, lekin ulanmadi" ogohlantirishi ko\'rsatiladi', async () => {
    const setServerUrl = vi
      .fn()
      .mockResolvedValue({ ok: true, connected: false, serverUrl: 'http://10.0.0.9:8001' });
    window.dentalDesktop = { setServerUrl };

    const { getByRole, findAllByText } = renderApp(
      <>
        <Notifications />
        <DesktopServerConnectionCard />
      </>,
    );
    fireEvent.change(getByRole('textbox'), { target: { value: 'http://10.0.0.9:8001' } });
    fireEvent.click(getByRole('button'));

    await waitFor(() => expect(setServerUrl).toHaveBeenCalled());
    expect(
      await findAllByText(i18n.t('settings.desktop_server_saved_not_connected')),
    ).not.toHaveLength(0);
  });

  it("setServerUrl reject qilsa umumiy xato xabari ko'rsatiladi", async () => {
    const setServerUrl = vi.fn().mockRejectedValue(new Error('IPC transport failure'));
    window.dentalDesktop = { setServerUrl };

    const { getByRole, findAllByText } = renderApp(
      <>
        <Notifications />
        <DesktopServerConnectionCard />
      </>,
    );
    fireEvent.change(getByRole('textbox'), { target: { value: 'http://10.0.0.9:8001' } });
    fireEvent.click(getByRole('button'));

    await waitFor(() => expect(setServerUrl).toHaveBeenCalled());
    expect(await findAllByText(i18n.t('settings.desktop_server_error'))).not.toHaveLength(0);
  });
});
