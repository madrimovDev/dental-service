import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { CheckInDialog } from './CheckInDialog';

const mutate = vi.fn();

vi.mock('../queue.api', () => ({
  useCheckInCandidates: () => ({
    data: [
      {
        id: 'a1',
        patientId: 'p1',
        serviceIds: ['s1'],
        startTime: '2026-06-11T05:00:00Z',
      },
    ],
  }),
  usePatientsAll: () => ({ data: { data: [{ id: 'p1', fullName: 'Ali Valiyev' }] } }),
  useServices: () => ({ data: [] }),
  useCreateTicket: () => ({ mutate, isPending: false }),
}));

describe('CheckInDialog', () => {
  it('yozuvdan check-in → appointmentId bilan create chaqiradi', () => {
    renderApp(<CheckInDialog opened onClose={vi.fn()} branchId="b1" />);
    fireEvent.click(screen.getByText('Navbatga olish'));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'b1', appointmentId: 'a1', patientId: 'p1' }),
      expect.anything(),
    );
  });
});
