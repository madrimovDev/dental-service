import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const fetchMock = vi.fn();

const renderApp = () =>
  render(
    <MantineProvider>
      <App />
    </MantineProvider>,
  );

describe('App routing guard (CLI-392)', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/');
  });

  it("admin_token yo'q holda to'g'ridan-to'g'ri / ga navigatsiya qilinsa /login ko'rsatiladi", async () => {
    renderApp();
    expect(await screen.findByText('Kirish')).toBeInTheDocument();
    expect(screen.queryByText('Klinikalar')).not.toBeInTheDocument();
    // No API calls should happen — the guard blocks before ClinicsPage mounts.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('admin_token mavjud holda / ClinicsPage render qilinadi', async () => {
    localStorage.setItem('admin_token', 'jwt-token-123');
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    renderApp();

    expect(await screen.findByText('Klinikalar')).toBeInTheDocument();
    expect(screen.queryByText('Kirish')).not.toBeInTheDocument();
  });
});
