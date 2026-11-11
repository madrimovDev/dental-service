import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { LabOrderDetailPage } from './LabOrderDetailPage';

const usePatientSpy = vi.fn();
const permissions = { current: new Set<string>() };
const approveMutate = vi.fn();
const postMutate = vi.fn();
const sendMutate = vi.fn();
const orderOver: { current: Record<string, unknown> } = { current: {} };
const hubState = { connected: true };

vi.mock('../../clinical.api', () => ({
  useLabOrder: () => ({
    data: {
      id: 'lo1',
      tenantId: 't',
      patientId: 'p1',
      doctorId: 'd',
      orderNumber: 7,
      labName: 'Lab X',
      orderType: 'crown',
      status: 'sent',
      items: [{ description: 'Koronka', toothNumbers: [26, 27], material: 'Sirkoniy' }],
      sentDate: '2026-06-10T00:00:00Z',
      expectedDate: null,
      deliveredDate: null,
      dueDate: '2026-06-20',
      shade: 'A2',
      remakeOfId: null,
      remakeReason: null,
      cost: null,
      currency: 'UZS',
      notes: 'Ehtiyot bo‘ling',
      createdAt: '2026-06-10T00:00:00Z',
      updatedAt: '2026-06-10T00:00:00Z',
      ...orderOver.current,
    },
    isLoading: false,
    isError: false,
  }),
  useUpdateLabOrderStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('./lab-order.api', () => ({
  useLabOrderFiles: () => ({ data: [], isLoading: false, isError: false }),
  useUploadLabOrderFile: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteLabOrderFile: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('./lab-hub.api', () => ({
  activeLabs: (labs?: { linkStatus: string | null }[]) =>
    (labs ?? []).filter((l) => l.linkStatus === 'active'),
  useLabHubStatus: () => ({ data: { connected: hubState.connected }, isLoading: false }),
  useLabHubLabs: () => ({
    data: {
      labs: [{ id: 'hl1', name: 'Oq Tish', city: null, description: null, linkStatus: 'active' }],
      stale: false,
    },
    isLoading: false,
  }),
  useSendToLabHub: () => ({ mutate: sendMutate, isPending: false }),
  useApproveLabPrice: () => ({ mutate: approveMutate, isPending: false }),
  useLabHubMessages: () => ({
    data: [
      {
        id: 'm1',
        labOrderId: 'lo1',
        author: 'lab',
        authorName: 'Texnik Anvar',
        kind: 'message',
        body: 'Rang A2 tasdiqlandimi?',
        file: null,
        synced: true,
        createdAt: '2026-06-11T00:00:00Z',
      },
    ],
  }),
  usePostLabHubMessage: () => ({ mutate: postMutate, isPending: false }),
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
    const state = { hasPermission: (p: string) => permissions.current.has(p) };
    return sel ? sel(state) : state;
  }, {}),
}));

const renderPage = () =>
  renderApp(
    <Routes>
      <Route path="/lab-orders/:id" element={<LabOrderDetailPage />} />
    </Routes>,
    { route: '/lab-orders/lo1' },
  );

describe('LabOrderDetailPage', () => {
  beforeEach(() => {
    usePatientSpy.mockReset();
    approveMutate.mockReset();
    postMutate.mockReset();
    sendMutate.mockReset();
    orderOver.current = {};
    hubState.connected = true;
    permissions.current = new Set(['lab_order.view', 'lab_order.manage', 'patient.view']);
  });

  it('buyurtma tafsiloti, bemor nomi va qayta tayyorlash havolasi', () => {
    renderPage();
    expect(screen.getByText(/Lab buyurtma №7 · Kamola Ergasheva/)).toBeInTheDocument();
    expect(screen.getByText('A2')).toBeInTheDocument();
    expect(screen.getByText('20.06.2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Qayta tayyorlash' })).toHaveAttribute(
      'href',
      '/patients/p1/lab-orders/new?remakeOf=lo1',
    );
  });

  it('Technician (faqat lab_order.view): bemor so‘rovi yo‘q, manage amallari yo‘q, orqaga → /lab', () => {
    permissions.current = new Set(['lab_order.view']);
    renderPage();
    for (const call of usePatientSpy.mock.calls) expect(call[0]).toBe('');
    expect(screen.queryByRole('link', { name: 'Qayta tayyorlash' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Orqaga' })).toHaveAttribute('href', '/lab');
  });

  it('L3: «Laboratoriya nimani ko‘radi» — to‘liq ism va klinika kodi', () => {
    renderPage();
    const block = screen.getByTestId('lab-sees');
    expect(block).toHaveTextContent('Kamola Ergasheva · ayol · 47');
    expect(block).not.toHaveTextContent('K. E.');
    expect(block).toHaveTextContent('LO-7');
  });

  it('portalga yuborilmagan, ulangan: faol labni tanlab yuborish', () => {
    renderPage();
    expect(screen.getByText('Portal orqali yuborish')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('textbox', { name: 'Laboratoriya' }));
    fireEvent.click(screen.getByRole('option', { name: 'Oq Tish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Laboratoriyaga yuborish' }));
    expect(sendMutate).toHaveBeenCalledWith({ labOrderId: 'lo1', labId: 'hl1' }, expect.anything());
  });

  it('portal buyurtmasi: sinxron/lab holati, narx taklifi «Tasdiqlash», yozishma', () => {
    orderOver.current = {
      labHubLabId: 'hl1',
      hubSyncStatus: 'synced',
      hubStatus: 'ready',
      proposedPrice: '350000.00',
      approvedPrice: null,
    };
    renderPage();
    const panel = screen.getByTestId('lab-hub-panel');
    expect(panel).toHaveTextContent('Portalga yetkazildi');
    expect(panel).toHaveTextContent('Tayyor');
    expect(panel).toHaveTextContent(/350[\s\u00a0 ]?000/);
    expect(panel).toHaveTextContent('Rang A2 tasdiqlandimi?');
    fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));
    expect(approveMutate).toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Laboratoriyaga xabar…' }), {
      target: { value: 'Ha, A2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Yuborish' }));
    expect(postMutate).toHaveBeenCalledWith('Ha, A2', expect.anything());
  });

  it('Nurse (faqat ko‘rish): tasdiqlash va xabar yozish yo‘q; rad etish sababi ko‘rinadi', () => {
    permissions.current = new Set(['lab_order.view', 'patient.view']);
    orderOver.current = {
      labHubLabId: 'hl1',
      hubSyncStatus: 'synced',
      hubStatus: 'rejected',
      hubRejectReason: 'Skan sifatsiz',
      proposedPrice: '350000.00',
    };
    renderPage();
    expect(screen.getByText('Skan sifatsiz')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tasdiqlash' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Laboratoriyaga xabar…' }),
    ).not.toBeInTheDocument();
  });
});
