import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('label va value ni render qiladi', () => {
    renderApp(<StatCard label="Daromad" value="1 000 000 so'm" />);
    expect(screen.getByText('Daromad')).toBeInTheDocument();
    expect(screen.getByText("1 000 000 so'm")).toBeInTheDocument();
  });

  it("hint berilganda uni ko'rsatadi", () => {
    renderApp(<StatCard label="No-show" value="5%" hint="oxirgi 30 kun" />);
    expect(screen.getByText('oxirgi 30 kun')).toBeInTheDocument();
  });

  it("hint berilmaganda crash bo'lmaydi", () => {
    renderApp(<StatCard label="Slot" value={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });
});
