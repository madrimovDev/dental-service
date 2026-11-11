import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../test-utils';
import { DesktopUpdateBanner } from './DesktopUpdateBanner';

type Cb = (s: { phase: 'ready' | 'installing'; installAt: string | null }) => void;

const bridge = () => {
  let cb: Cb | null = null;
  const installUpdateNow = vi.fn();
  const installUpdateTonight = vi.fn();
  window.dentalDesktop = {
    onUpdateState: (c: Cb) => {
      cb = c;
      return () => {};
    },
    installUpdateNow,
    installUpdateTonight,
  } as unknown as typeof window.dentalDesktop;
  return {
    emit: (s: Parameters<Cb>[0]) => act(() => cb?.(s)),
    installUpdateNow,
    installUpdateTonight,
  };
};

afterEach(() => {
  delete window.dentalDesktop;
});

describe('DesktopUpdateBanner (UI-T3)', () => {
  it("brauzerda (dentalDesktop yo'q) hech narsa chizmaydi", () => {
    const { container } = renderApp(<DesktopUpdateBanner />);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it("desktop'da ready holatida sarlavha, vaqt va «Hozir o'rnatish» ishlaydi", () => {
    const b = bridge();
    renderApp(<DesktopUpdateBanner />);
    expect(screen.queryByText(i18n.t('desktopUpdate.title'))).toBeNull();

    b.emit({ phase: 'ready', installAt: new Date(2026, 10, 11, 19, 0).toISOString() });

    expect(screen.getByText(i18n.t('desktopUpdate.title'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('desktopUpdate.now') }));
    expect(b.installUpdateNow).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('desktopUpdate.tonight') }));
    expect(b.installUpdateTonight).toHaveBeenCalledTimes(1);
  });

  it("installing holatida «kompyuterni o'chirmang» ko'rsatiladi, tugmalarsiz", () => {
    const b = bridge();
    renderApp(<DesktopUpdateBanner />);
    b.emit({ phase: 'installing', installAt: null });
    expect(screen.getByText(i18n.t('desktopUpdate.installing'))).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
