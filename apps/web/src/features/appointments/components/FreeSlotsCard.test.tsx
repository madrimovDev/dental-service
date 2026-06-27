import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { FreeSlotsCard } from './FreeSlotsCard';

const availabilityMock = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));

vi.mock('../appointments.api', () => ({
  useBranchAvailability: () => availabilityMock,
}));

describe('FreeSlotsCard', () => {
  it('filial tanlanmasa filial-tanlash hintini ko‘rsatadi', () => {
    availabilityMock.data = undefined;
    renderApp(<FreeSlotsCard branchId={null} date="2026-06-27" enabled />);
    expect(screen.getByTestId('free-slots-empty')).toHaveTextContent('Filial');
  });

  it("bo'sh slot bo'lmasa no_slots holatini ko'rsatadi", () => {
    availabilityMock.data = { branchId: 'b1', date: '2026-06-27', slotMinutes: 30, doctors: [] };
    renderApp(<FreeSlotsCard branchId="b1" date="2026-06-27" enabled />);
    expect(screen.getByTestId('free-slots-empty')).toBeInTheDocument();
  });

  it('doktorlar bo‘yicha bo‘sh slot vaqtlarini dedupe qilib chiqaradi', () => {
    // Ikki doktor 09:00da bo'sh — bitta chip; jami 2 noyob vaqt.
    availabilityMock.data = {
      branchId: 'b1',
      date: '2026-06-27',
      slotMinutes: 30,
      doctors: [
        {
          doctorId: 'd1',
          slots: [
            { start: '2026-06-27T04:00:00.000Z', end: '', startMinute: 540, endMinute: 570 },
            { start: '2026-06-27T04:30:00.000Z', end: '', startMinute: 570, endMinute: 600 },
          ],
        },
        {
          doctorId: 'd2',
          slots: [{ start: '2026-06-27T04:00:00.000Z', end: '', startMinute: 540, endMinute: 570 }],
        },
      ],
    };
    renderApp(<FreeSlotsCard branchId="b1" date="2026-06-27" enabled />);
    expect(screen.getByTestId('free-slots-list')).toBeInTheDocument();
    // 540 va 570 daqiqa = 2 noyob slot.
    expect(screen.getByTestId('free-slots-count')).toHaveTextContent('2');
  });
});
