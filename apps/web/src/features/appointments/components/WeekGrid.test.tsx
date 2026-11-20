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
});
