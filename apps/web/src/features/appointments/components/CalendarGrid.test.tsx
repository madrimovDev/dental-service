import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import type { Appointment, Doctor } from '../appointments.types';
import { CalendarGrid } from './CalendarGrid';

const doctors: Doctor[] = [{ id: 'd1', name: 'Dr. Ali' }];
const appts: Appointment[] = [
  {
    id: 'a1',
    tenantId: 't',
    branchId: 'b',
    patientId: 'p1',
    doctorId: 'd1',
    assistantId: null,
    startTime: '2026-06-10T05:00:00Z',
    endTime: '2026-06-10T05:30:00Z',
    status: 'scheduled',
    serviceIds: [],
    notes: null,
    cancellationReason: null,
    createdAt: '',
    updatedAt: '',
  },
];

describe('CalendarGrid', () => {
  it("doktor ustuni va slotni ko'rsatadi", () => {
    renderApp(
      <CalendarGrid
        appointments={appts}
        doctors={doctors}
        patientName={() => 'Bemor X'}
        onSlotClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Dr. Ali')).toBeInTheDocument();
    expect(screen.getByText(/Bemor X/)).toBeInTheDocument();
  });

  // FT-05.1: bo'sh katak → yangi yozilish (doktor + boshlanish daqiqasi).
  it("bo'sh katakka bosish onCellClick(doktor, boshlanish daqiqasi) chaqiradi", () => {
    const onCellClick = vi.fn();
    renderApp(
      <CalendarGrid
        appointments={appts}
        doctors={doctors}
        patientName={() => 'Bemor X'}
        onCellClick={onCellClick}
      />,
    );
    // GRID.dayStartHour = 8 → 4-qator (indeks 3) = 09:30
    fireEvent.click(screen.getByRole('button', { name: /Dr\. Ali.*09:30/ }));
    expect(onCellClick).toHaveBeenCalledWith({ doctorId: 'd1', startMinute: 570 });
  });

  it("jadvalsiz doktor ustunida bo'sh katak bosilmaydi", () => {
    const onCellClick = vi.fn();
    renderApp(
      <CalendarGrid
        appointments={[]}
        doctors={doctors}
        patientName={() => 'Bemor X'}
        onCellClick={onCellClick}
        unscheduledDoctorIds={new Set(['d1'])}
      />,
    );
    expect(screen.queryByRole('button', { name: /09:30/ })).not.toBeInTheDocument();
  });

  it("onCellClick bo'lmasa katak tugmalari chiqmaydi (ruxsat yo'q)", () => {
    renderApp(
      <CalendarGrid appointments={appts} doctors={doctors} patientName={() => 'Bemor X'} />,
    );
    expect(screen.queryByRole('button', { name: /09:30/ })).not.toBeInTheDocument();
  });

  // FT-05.2: grid soatlari `grid` prop'dan (filial ish vaqti).
  it('soat belgilari va katak vaqtlari `grid` oynasidan', () => {
    const onCellClick = vi.fn();
    renderApp(
      <CalendarGrid
        appointments={[]}
        doctors={doctors}
        patientName={() => 'X'}
        onCellClick={onCellClick}
        grid={{ dayStartHour: 6, dayEndHour: 22, stepMin: 30, pxPerMin: 88 / 60 }}
      />,
    );
    expect(screen.getByText('06:00')).toBeInTheDocument();
    expect(screen.getByText('21:00')).toBeInTheDocument();
    expect(screen.queryByText('22:00')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Dr\. Ali.*06:30/ }));
    expect(onCellClick).toHaveBeenCalledWith({ doctorId: 'd1', startMinute: 390 });
  });

  it('ish soatidan tashqari yozilishda «soatdan tashqari» belgi chiqadi', () => {
    renderApp(
      <CalendarGrid
        appointments={appts}
        doctors={doctors}
        patientName={() => 'Bemor X'}
        outsideHoursIds={new Set(['a1'])}
      />,
    );
    expect(screen.getByText('Soatdan tashqari')).toBeInTheDocument();
  });

  it('belgi faqat tashqaridagi yozilishda', () => {
    renderApp(
      <CalendarGrid appointments={appts} doctors={doctors} patientName={() => 'Bemor X'} />,
    );
    expect(screen.queryByText('Soatdan tashqari')).not.toBeInTheDocument();
  });
});
