import { StateView } from '@dental/ui';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test-utils';

describe('StateView', () => {
  it('loading — skeleton render qiladi', () => {
    renderApp(<StateView status="loading" skeleton="table" />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("empty — title/description/action ko'rsatadi", () => {
    renderApp(
      <StateView
        status="empty"
        title="Bo'sh"
        description="Yozuv yo'q"
        action={<button type="button">Qo'shish</button>}
      />,
    );
    expect(screen.getByText("Bo'sh")).toBeInTheDocument();
    expect(screen.getByText("Yozuv yo'q")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Qo'shish" })).toBeInTheDocument();
  });

  it('error — onRetry tugmasi bosilganda chaqiriladi', () => {
    const onRetry = vi.fn();
    renderApp(<StateView status="error" title="Xato" retryLabel="Qayta" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Qayta' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
