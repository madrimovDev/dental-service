import { fireEvent, screen, waitFor } from '@testing-library/react';
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

const openForm = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Yangi buyurtma' }));
  return screen.findByLabelText(/Laboratoriya nomi/);
};

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

  it("forma: rang va muddatsiz yuborib bo'lmaydi (majburiy) — create chaqirilmaydi", async () => {
    renderApp(<LabOrdersTab patientId="p1" />);
    fireEvent.change(await openForm(), { target: { value: 'Oq Tish' } });
    fireEvent.click(screen.getByRole('button', { name: 'Laboratoriyaga yuborish' }));
    expect(await screen.findByText('Rangni tanlang')).toBeInTheDocument();
    expect(screen.getByText('Kerakli sanani kiriting')).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it('forma: «Laboratoriya nimani ko‘radi» bloki telefon/manzilni yashiradi, bemorni qisqartiradi', async () => {
    renderApp(<LabOrdersTab patientId="p1" />);
    await openForm();
    const block = screen.getByTestId('lab-sees');
    expect(block).toHaveTextContent('K. E.');
    expect(block).toHaveTextContent("ko'rsatilmaydi");
    expect(block).not.toHaveTextContent('Kamola Ergasheva');
  });

  it('forma: muddat keyingi yozilishdan kech bo‘lsa ogohlantirish', async () => {
    renderApp(<LabOrdersTab patientId="p1" />);
    await openForm();
    const p2 = (n: number) => String(n).padStart(2, '0');
    const late = new Date(future.getTime() + 3 * 86_400_000);
    const ymd = `${late.getFullYear()}-${p2(late.getMonth() + 1)}-${p2(late.getDate())}`;
    fireEvent.change(screen.getByLabelText(/Kerakli sana/), { target: { value: ymd } });
    expect(await screen.findByText(/kun kech/)).toBeInTheDocument();
  });

  it("forma: to'liq to'ldirilsa create to'g'ri shape bilan va yuboriladi (status sent)", async () => {
    renderApp(<LabOrdersTab patientId="p1" />);
    fireEvent.change(await openForm(), { target: { value: 'Lab Z' } });
    fireEvent.click(screen.getByText('A3'));
    fireEvent.change(screen.getByLabelText(/Kerakli sana/), { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Laboratoriyaga yuborish' }));
    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'p1',
        doctorId: 'u1',
        labName: 'Lab Z',
        orderType: 'crown',
        shade: 'A3',
        dueDate: '2026-12-01',
      }),
    );
    await waitFor(() =>
      expect(statusMutateAsync).toHaveBeenCalledWith({ id: 'new1', status: 'sent' }),
    );
  });

  it('forma: remake belgilansa asl buyurtma va sabab majburiy', async () => {
    renderApp(<LabOrdersTab patientId="p1" />);
    fireEvent.change(await openForm(), { target: { value: 'Lab Z' } });
    fireEvent.click(screen.getByText('A3'));
    fireEvent.change(screen.getByLabelText(/Kerakli sana/), { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByLabelText(/qayta tayyorlash/));
    fireEvent.click(screen.getByRole('button', { name: 'Laboratoriyaga yuborish' }));
    expect(await screen.findByText('Asl buyurtmani tanlang')).toBeInTheDocument();
    expect(screen.getByText('Sababni tanlang')).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });
});
