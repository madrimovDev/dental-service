import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { LabOrdersTab } from './LabOrdersTab';

const updateMutate = vi.fn();
const createMutateAsync = vi.fn();
const statusMutateAsync = vi.fn();
const uploadMutateAsync = vi.fn();

const future = new Date(Date.now() + 5 * 86_400_000);

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
        dueDate: '2026-06-20',
        shade: 'A2',
        remakeOfId: null,
        remakeReason: null,
        cost: '500000',
        currency: 'UZS',
        notes: null,
        createdAt: '2026-06-10T00:00:00Z',
        updatedAt: '2026-06-10T00:00:00Z',
      },
    ],
    isLoading: false,
  }),
  useCreateLabOrder: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateLabOrderStatus: () => ({
    mutate: updateMutate,
    mutateAsync: statusMutateAsync,
    isPending: false,
  }),
  usePatientAppointments: () => ({
    data: [{ startTime: future.toISOString(), status: 'scheduled' }],
    isLoading: false,
  }),
}));
vi.mock('./lab-order.api', () => ({
  useUploadLabOrderFile: () => ({ mutateAsync: uploadMutateAsync, isPending: false }),
  useLabOrderFiles: () => ({ data: [], isLoading: false, isError: false }),
  useDeleteLabOrderFile: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/patients/patients.api', () => ({
  usePatient: () => ({
    data: { id: 'p1', fullName: 'Kamola Ergasheva', genderLabel: 'ayol', age: 47 },
  }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: Object.assign((sel?: (s: unknown) => unknown) => {
    const state = { user: { id: 'u1', fullName: 'Dr. Yusupova' }, hasPermission: () => true };
    return sel ? sel(state) : state;
  }, {}),
}));

describe('LabOrdersTab', () => {
  beforeEach(() => {
    createMutateAsync.mockReset();
    statusMutateAsync.mockReset();
    uploadMutateAsync.mockReset();
    createMutateAsync.mockResolvedValue({ id: 'new1' });
    statusMutateAsync.mockResolvedValue({});
  });

  it('lab nomini, rang va muddatni render qiladi', () => {
    renderApp(<LabOrdersTab patientId="p1" />);
    expect(screen.getByText('Lab X')).toBeInTheDocument();
    expect(screen.getByText('A2')).toBeInTheDocument();
    expect(screen.getByText('20.06.2026')).toBeInTheDocument();
  });

  // B2 (CLI-439): status Select faqat joriy + ruxsat etilgan keyingi statuslarni
  // ko'rsatadi — mocked buyurtma status='sent' → ruxsat: sent/in_progress/cancelled.
  it("status Select faqat ruxsat etilgan keyingi statuslarni ko'rsatadi (6ta shartsiz emas)", async () => {
    renderApp(<LabOrdersTab patientId="p1" />);
    const input = screen.getByDisplayValue('Yuborilgan');
    fireEvent.click(input);
    expect(await screen.findByText('Tayyorlanmoqda')).toBeInTheDocument();
    expect(screen.getByText('Bekor qilingan')).toBeInTheDocument();
    expect(screen.queryByText('Qoralama')).not.toBeInTheDocument();
    expect(screen.queryByText('Tayyor')).not.toBeInTheDocument();
    expect(screen.queryByText('Yetkazilgan')).not.toBeInTheDocument();
  });

  it('«Yangi buyurtma» alohida sahifaga o‘tadi (modal emas)', () => {
    renderApp(<LabOrdersTab patientId="p1" />);
    const link = screen.getByRole('link', { name: 'Yangi buyurtma' });
    expect(link).toHaveAttribute('href', '/patients/p1/lab-orders/new');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
