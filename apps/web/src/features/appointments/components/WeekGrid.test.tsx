import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { WeekGrid } from './WeekGrid';

describe('WeekGrid', () => {
  // FT-05.1: hafta ko'rinishida ham bo'sh katak → yangi yozilish (kun + daqiqa).
  it("bo'sh katakka bosish onCellClick(kun, boshlanish daqiqasi) chaqiradi", () => {
    const onCellClick = vi.fn();
    renderApp(
      <WeekGrid
        appointments={[]}
        dayKeys={['2026-06-08', '2026-06-09']}
        patientName={() => 'X'}
        onCellClick={onCellClick}
      />,
    );
    const cells = screen.getAllByRole('button', { name: /10:00/ });
    expect(cells).toHaveLength(2);
    fireEvent.click(cells[1] as HTMLElement);
    expect(onCellClick).toHaveBeenCalledWith({ dateKey: '2026-06-09', startMinute: 600 });
  });

  it("onCellClick bo'lmasa katak tugmalari chiqmaydi", () => {
    renderApp(<WeekGrid appointments={[]} dayKeys={['2026-06-08']} patientName={() => 'X'} />);
    expect(screen.queryByRole('button', { name: /10:00/ })).not.toBeInTheDocument();
  });

  it('hafta ko‘rinishi ham `grid` oynasidan soat belgilarini oladi', () => {
    renderApp(
      <WeekGrid
        appointments={[]}
        dayKeys={['2026-06-08']}
        patientName={() => 'X'}
        grid={{ dayStartHour: 7, dayEndHour: 19, stepMin: 30, pxPerMin: 88 / 60 }}
      />,
    );
    expect(screen.getByText('07:00')).toBeInTheDocument();
    expect(screen.getByText('18:00')).toBeInTheDocument();
    expect(screen.queryByText('19:00')).not.toBeInTheDocument();
    expect(screen.queryByText('08:00')).toBeInTheDocument();
  });
});
