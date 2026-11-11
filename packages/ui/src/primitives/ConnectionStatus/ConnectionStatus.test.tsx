import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUI } from '../../test-utils';
import { ConnectionStatus, deriveConnectionStatus } from './ConnectionStatus';

describe('deriveConnectionStatus', () => {
  it('rejim va ulanishdan holatni aniqlaydi', () => {
    expect(deriveConnectionStatus({ mode: 'desktop', online: true, serverReachable: true })).toBe(
      'lan',
    );
    expect(deriveConnectionStatus({ mode: 'cloud', online: true, serverReachable: true })).toBe(
      'cloud',
    );
    expect(deriveConnectionStatus({ mode: 'desktop', online: false, serverReachable: true })).toBe(
      'offline',
    );
    expect(deriveConnectionStatus({ mode: 'cloud', online: true, serverReachable: false })).toBe(
      'noserver',
    );
  });
});

describe('ConnectionStatus', () => {
  it('sarlavha, tavsif va data-status', () => {
    renderUI(
      <ConnectionStatus status="offline" title="Internet yo'q" description="Ish davom etmoqda" />,
    );
    const el = screen.getByRole('status');
    expect(el.getAttribute('data-status')).toBe('offline');
    expect(el).toHaveTextContent("Internet yo'q");
    expect(el).toHaveTextContent('Ish davom etmoqda');
  });
});
