import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUI } from '../../test-utils';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it("matn va status data-atributini qo'yadi", () => {
    renderUI(<StatusPill status="success">Tugadi</StatusPill>);
    const el = screen.getByText('Tugadi');
    expect(el.closest('[data-status="success"]')).not.toBeNull();
  });

  it("dot=false bo'lsa nuqta render qilmaydi", () => {
    const { container } = renderUI(
      <StatusPill status="info" dot={false}>
        Qabulda
      </StatusPill>,
    );
    expect(container.querySelector('[data-pill-dot]')).toBeNull();
  });
});
