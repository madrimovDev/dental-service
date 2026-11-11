import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { LabOrderDetailPage } from './LabOrderDetailPage';

const usePatientSpy = vi.fn();
const permissions = { current: new Set<string>() };

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
});
