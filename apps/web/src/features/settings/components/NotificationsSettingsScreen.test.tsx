import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { NotificationsSettingsScreen } from './NotificationsSettingsScreen';

// Shell ichidagi auth-store gating'ni neytrallashtiramiz (T6 doirasidan tashqari).
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

describe('NotificationsSettingsScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('4 ta pref qatori (toggle) render qiladi', () => {
    renderApp(<NotificationsSettingsScreen />);
    expect(screen.getAllByRole('switch')).toHaveLength(4);
  });

  it('toggle bosilganda aria-checked holati o‘zgaradi', () => {
    renderApp(<NotificationsSettingsScreen />);
    const first = screen.getAllByRole('switch')[0]!;
    const before = first.getAttribute('aria-checked');
    fireEvent.click(first);
    expect(first.getAttribute('aria-checked')).not.toBe(before);
  });

  it('toggle hech qanday tarmoq chaqiruvini ishga tushirmaydi (DS12 deferred — vizual-only)', () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    renderApp(<NotificationsSettingsScreen />);
    for (const sw of screen.getAllByRole('switch')) {
      fireEvent.click(sw);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
