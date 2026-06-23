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

  it("icon-chip/unit/delta/spark berilmaganda crash bo'lmaydi", () => {
    renderApp(<StatCard label="Slot" value={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    // optional props rendered yo'q — DOM da delta o'qi (▲/▼) bo'lmasligi kerak
    expect(screen.queryByText('▲')).not.toBeInTheDocument();
    expect(screen.queryByText('▼')).not.toBeInTheDocument();
  });

  it('icon-chip, unit va delta berilganda ularni render qiladi', () => {
    renderApp(
      <StatCard
        label="Daromad"
        value="26.2"
        unit="mln"
        icon={<span>★</span>}
        tone="primary"
        delta={{ direction: 'up', text: '12.4%', tone: 'success' }}
      />,
    );
    expect(screen.getByText('26.2')).toBeInTheDocument();
    expect(screen.getByText('mln')).toBeInTheDocument();
    expect(screen.getByText('★')).toBeInTheDocument();
    expect(screen.getByText('12.4%')).toBeInTheDocument();
    expect(screen.getByText('▲')).toBeInTheDocument();
  });

  it("delta flat bo'lganda o'q render qilmaydi", () => {
    renderApp(<StatCard label="No-show" value="5%" delta={{ direction: 'flat', text: '0%' }} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.queryByText('▲')).not.toBeInTheDocument();
    expect(screen.queryByText('▼')).not.toBeInTheDocument();
  });
});
