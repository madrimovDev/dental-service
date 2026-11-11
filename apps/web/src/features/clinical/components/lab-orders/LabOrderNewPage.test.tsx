import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { LabOrderNewPage } from './LabOrderNewPage';

const createMutateAsync = vi.fn();
const statusMutateAsync = vi.fn();
const uploadMutateAsync = vi.fn();
const usePatientSpy = vi.fn();
const permissions = { current: new Set<string>() };

const future = new Date(Date.now() + 5 * 86_400_000);

const wire = (o: Record<string, unknown>) => ({
  id: 'lo1',
  patientId: 'p1',
  orderNumber: 1,
  labName: 'Oq Tish',
  orderType: 'crown',
  status: 'delivered',
  items: [],
  sentDate: '2026-06-01T00:00:00Z',
  deliveredDate: '2026-06-06T00:00:00Z',
  remakeOfId: null,
  ...o,
});

vi.mock('../../clinical.api', () => ({
  useLabOrders: () => ({ data: [wire({})], isLoading: false }),
  useLabOrdersList: () => ({
    data: { data: [wire({}), wire({ id: 'lo2', labName: 'Dental Lab Pro', status: 'sent' })] },
  }),
  useCreateLabOrder: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateLabOrderStatus: () => ({ mutateAsync: statusMutateAsync, isPending: false }),
  usePatientAppointments: () => ({
    data: [{ startTime: future.toISOString(), status: 'scheduled' }],
    isLoading: false,
  }),
}));
vi.mock('./lab-order.api', () => ({
  useUploadLabOrderFile: () => ({ mutateAsync: uploadMutateAsync, isPending: false }),
}));
vi.mock('@/features/patients/patients.api', () => ({
  usePatient: (id: string) => {
    usePatientSpy(id);
    return {
      data: id ? { id, fullName: 'Kamola Ergasheva', genderLabel: 'ayol', age: 47 } : undefined,
    };
  },
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: Object.assign((sel?: (s: unknown) => unknown) => {
    const state = {
      user: { id: 'u1', fullName: 'Dr. Yusupova' },
      hasPermission: (p: string) => permissions.current.has(p),
    };
    return sel ? sel(state) : state;
  }, {}),
}));

const renderPage = (route = '/patients/p1/lab-orders/new') =>
  renderApp(
    <Routes>
      <Route path="/patients/:id/lab-orders/new" element={<LabOrderNewPage />} />
      <Route path="/lab-orders/:id" element={<div>detail-page</div>} />
    </Routes>,
    { route },
  );

describe('LabOrderNewPage', () => {
  beforeEach(() => {
    createMutateAsync.mockReset().mockResolvedValue({ id: 'new1' });
    statusMutateAsync.mockReset().mockResolvedValue({});
    uploadMutateAsync.mockReset();
    usePatientSpy.mockReset();
    permissions.current = new Set(['lab_order.manage', 'lab_order.view', 'patient.view']);
  });

  it('sahifa sarlavhasi bemor nomi bilan, orqaga havola bemor kartasiga', async () => {
    renderPage();
    expect(await screen.findByText(/Kamola Ergasheva/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Orqaga' })).toHaveAttribute('href', '/patients/p1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('oldingi laboratoriyalar statistika bilan; kartani bosish lab nomini to‘ldiradi', async () => {
    renderPage();
    const card = await screen.findByRole('button', { name: /Oq Tish/ });
    expect(card).toHaveTextContent("o'rtacha 5 kun");
    fireEvent.click(card);
    expect(screen.getByLabelText(/Laboratoriya nomi/)).toHaveValue('Oq Tish');
    expect(card).toHaveAttribute('aria-pressed', 'true');
  });

  it('Technician (patient.view yo‘q): bemor so‘rovi yuborilmaydi — 403 shovqini yo‘q', () => {
    permissions.current = new Set(['lab_order.manage', 'lab_order.view']);
    renderPage();
    expect(usePatientSpy).toHaveBeenCalled();
    for (const call of usePatientSpy.mock.calls) expect(call[0]).toBe('');
  });

  it("forma: rang va muddatsiz yuborib bo'lmaydi (majburiy) — create chaqirilmaydi", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText(/Laboratoriya nomi/), {
      target: { value: 'Oq Tish' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Laboratoriyaga yuborish' }));
    expect(await screen.findByText('Rangni tanlang')).toBeInTheDocument();
    expect(screen.getByText('Kerakli sanani kiriting')).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it('forma: «Laboratoriya nimani ko‘radi» bloki telefon/manzilni yashiradi, bemorni qisqartiradi', async () => {
    renderPage();
    const block = await screen.findByTestId('lab-sees');
    expect(block).toHaveTextContent('K. E.');
    expect(block).toHaveTextContent("ko'rsatilmaydi");
    expect(block).not.toHaveTextContent('Kamola Ergasheva');
  });

  it('forma: muddat keyingi yozilishdan kech bo‘lsa ogohlantirish', async () => {
    renderPage();
    const p2 = (n: number) => String(n).padStart(2, '0');
    const late = new Date(future.getTime() + 3 * 86_400_000);
    const ymd = `${late.getFullYear()}-${p2(late.getMonth() + 1)}-${p2(late.getDate())}`;
    fireEvent.change(await screen.findByLabelText(/Kerakli sana/), { target: { value: ymd } });
    expect(await screen.findByText(/kun kech/)).toBeInTheDocument();
  });

  it("forma: to'liq to'ldirilsa create to'g'ri shape bilan, status sent va buyurtma sahifasiga o'tadi", async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText(/Laboratoriya nomi/), {
      target: { value: 'Lab Z' },
    });
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
    expect(await screen.findByText('detail-page')).toBeInTheDocument();
  });

  it('forma: remake belgilansa asl buyurtma va sabab majburiy', async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText(/Laboratoriya nomi/), {
      target: { value: 'Lab Z' },
    });
    fireEvent.click(screen.getByText('A3'));
    fireEvent.change(screen.getByLabelText(/Kerakli sana/), { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByLabelText(/qayta tayyorlash/));
    fireEvent.click(screen.getByRole('button', { name: 'Laboratoriyaga yuborish' }));
    expect(await screen.findByText('Asl buyurtmani tanlang')).toBeInTheDocument();
    expect(screen.getByText('Sababni tanlang')).toBeInTheDocument();
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it('?remakeOf — remake belgilanadi va asl buyurtma tanlangan bo‘ladi', async () => {
    renderPage('/patients/p1/lab-orders/new?remakeOf=lo1');
    await waitFor(() => expect(screen.getByLabelText(/qayta tayyorlash/)).toBeChecked());
    expect(screen.getByLabelText(/Laboratoriya nomi/)).toHaveValue('Oq Tish');
  });
});
