import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { LabOrdersTab } from './LabOrdersTab';

const updateMutate = vi.fn();
vi.mock('../../clinical.api', () => ({
  useLabOrders: () => ({
    data: [
      {
        id: 'lo1',
        tenantId: 't',
        patientId: 'p',
        doctorId: 'd',
        orderNumber: 1,
        labName: 'Lab X',
        orderType: 'crown',
        status: 'sent',
        items: [{ description: 'Koronka', toothNumbers: [26, 27] }],
        sentDate: '2026-06-10T00:00:00Z',
        expectedDate: null,
        deliveredDate: null,
        cost: '500000',
        currency: 'UZS',
        notes: null,
        createdAt: '2026-06-10T00:00:00Z',
        updatedAt: '2026-06-10T00:00:00Z',
      },
    ],
    isLoading: false,
  }),
  useCreateLabOrder: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateLabOrderStatus: () => ({ mutate: updateMutate }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ user: { id: 'u1' }, hasPermission: () => true }),
}));

describe('LabOrdersTab', () => {
  it('lab nomini va status pill ni render qiladi', () => {
    renderApp(<LabOrdersTab patientId="p1" />);
    expect(screen.getByText('Lab X')).toBeInTheDocument();
  });
});
