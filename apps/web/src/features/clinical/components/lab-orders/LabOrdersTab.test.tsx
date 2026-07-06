import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { LabOrdersTab } from './LabOrdersTab';

const updateMutate = vi.fn();
const createMutate = vi.fn();
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
  useCreateLabOrder: () => ({ mutate: createMutate, isPending: false }),
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

  // B2 (CLI-439): status Select faqat joriy + ruxsat etilgan keyingi statuslarni
  // ko'rsatadi — mocked buyurtma status='sent' → ruxsat: sent/in_progress/cancelled.
  // draft/ready/delivered (orqaga qaytish yoki bosqich sakrash) ko'rinmasligi kerak.
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

  // Characterization: create-modal submit hozirgi payload shaklini saqlaydi (CLI-117 refactor guard).
  it("create form submit → createLabOrder to'g'ri shape bilan", async () => {
    createMutate.mockClear();
    renderApp(<LabOrdersTab patientId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Yangi buyurtma' }));
    fireEvent.change(await screen.findByLabelText(/Laboratoriya nomi/), {
      target: { value: 'Lab Z' },
    });
    fireEvent.click(screen.getByRole('button', { name: "Element qo'shish" }));
    fireEvent.change(screen.getByLabelText('Tavsif'), { target: { value: 'Koronka' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'p1',
        doctorId: 'u1',
        labName: 'Lab Z',
        orderType: 'crown',
        items: [expect.objectContaining({ description: 'Koronka' })],
      }),
      expect.anything(),
    );
  });
});
