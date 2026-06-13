import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test-utils';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it("xato bo'lsa fallback ko'rsatadi", () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderApp(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Xatolik yuz berdi')).toBeInTheDocument();
  });
});
