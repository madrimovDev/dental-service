import { afterEach, describe, expect, it } from 'vitest';
import { renderApp } from '../../../test-utils';
import { DesktopServerConnectionCard } from './DesktopServerConnectionCard';

afterEach(() => {
  delete window.dentalDesktop;
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
});
