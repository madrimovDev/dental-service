import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderUI } from '../../test-utils';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('label, value, unit va delta render qiladi', () => {
    renderUI(<StatCard label="Kassa" value="2 400" unit="ming" delta="12%" deltaDir="up" />);
    expect(screen.getByText('Kassa')).toBeInTheDocument();
    expect(screen.getByText('2 400')).toBeInTheDocument();
    expect(screen.getByText('ming')).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();
  });

  it('deltaDir="down" data-atributini qoyadi', () => {
    const { container } = renderUI(
      <StatCard label="No-show" value="3" delta="2%" deltaDir="down" />,
    );
    expect(container.querySelector('[data-delta="down"]')).not.toBeNull();
  });
});
