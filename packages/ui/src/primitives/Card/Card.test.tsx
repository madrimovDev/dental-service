import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUI } from '../../test-utils';
import { Card } from './Card';

describe('Card', () => {
  it('title, subtitle, actions va body render qiladi', () => {
    renderUI(
      <Card title="Bemorlar" subtitle="Bugun" actions={<button type="button">Yangi</button>}>
        <p>Tarkib</p>
      </Card>,
    );
    expect(screen.getByText('Bemorlar')).toBeInTheDocument();
    expect(screen.getByText('Bugun')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yangi' })).toBeInTheDocument();
    expect(screen.getByText('Tarkib')).toBeInTheDocument();
  });

  it('headersiz (title yoq) faqat body render qiladi', () => {
    const { container } = renderUI(
      <Card>
        <p>Faqat tarkib</p>
      </Card>,
    );
    expect(container.querySelector('[data-card-header]')).toBeNull();
  });
});
