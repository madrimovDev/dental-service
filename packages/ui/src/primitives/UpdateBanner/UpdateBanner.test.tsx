import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderUI } from '../../test-utils';
import { UpdateBanner } from './UpdateBanner';

describe('UpdateBanner', () => {
  it('sarlavha, matn va harakatlar', () => {
    const onClick = vi.fn();
    renderUI(
      <UpdateBanner
        title="Yangi versiya 0.2.0 tayyor"
        actions={[{ label: "Vaqtni o'zgartirish", onClick }]}
      >
        Klinika yopilgandan keyin o'rnatiladi.
      </UpdateBanner>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Yangi versiya 0.2.0 tayyor');
    fireEvent.click(screen.getByRole('button', { name: "Vaqtni o'zgartirish" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
