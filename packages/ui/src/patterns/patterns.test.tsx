import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUI } from '../test-utils';
import { Mono } from './Mono';
import { PageHead } from './PageHead';

describe('patterns', () => {
  it('Mono tarkibni render qiladi', () => {
    renderUI(<Mono>2 400 000</Mono>);
    expect(screen.getByText('2 400 000')).toBeInTheDocument();
  });

  it('PageHead title + subtitle + actions render qiladi', () => {
    renderUI(
      <PageHead
        title="Bemorlar"
        subtitle="Jami 1 240"
        actions={<button type="button">Yangi</button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Bemorlar' })).toBeInTheDocument();
    expect(screen.getByText('Jami 1 240')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yangi' })).toBeInTheDocument();
  });
});
