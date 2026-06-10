import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderUI } from '../../test-utils';
import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('aria-label qoyadi va click ishlaydi', () => {
    const onClick = vi.fn();
    renderUI(
      <IconButton label="Sozlamalar" onClick={onClick}>
        <svg />
      </IconButton>,
    );
    const btn = screen.getByRole('button', { name: 'Sozlamalar' });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('dot indikatorini korsatadi', () => {
    const { container } = renderUI(
      <IconButton label="Bell" dot>
        <svg />
      </IconButton>,
    );
    expect(container.querySelector('[data-dot]')).not.toBeNull();
  });
});
