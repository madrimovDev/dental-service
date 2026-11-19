import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';

// FX-92 (LB-01): navbat sahifalarida bemor ismi `listPatients({pageSize:100})` (eng yangi
// 100 bemor) dan hal qilinardi → ro'yxatga kirmagan bemor '—' bo'lib qolardi. Bu test
// haqiqiy hook'lar bilan (faqat api-client mock) ro'yxatda YO'Q bemorni tekshiradi.
const api = vi.hoisted(() => ({
  listPatients: vi.fn(),
  getPatient: vi.fn(),
  getQueueToday: vi.fn(),
  getCheckInCandidates: vi.fn(),
  listBranches: vi.fn(),
  listServices: vi.fn(),
}));

vi.mock('@dental/api-client', async (orig) => {
  const actual = await orig<typeof import('@dental/api-client')>();
  return { ...actual, ...api };
});

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true, activeBranchId: 'b1' }),
}));

const { QueueBoard } = await import('./QueueBoard');
const { CheckInDialog } = await import('./CheckInDialog');

const OLD = { id: 'p-old', fullName: 'Eski Bemorov' };

beforeEach(() => {
  api.listPatients.mockResolvedValue({
    data: {
      data: [{ id: 'p-new', fullName: 'Yangi Bemorov' }],
      meta: { page: 1, pageSize: 100, total: 400 },
    },
  });
  api.getPatient.mockImplementation((id: string) =>
    Promise.resolve({ data: id === OLD.id ? OLD : { id, fullName: 'Boshqa' } }),
  );
  api.listBranches.mockResolvedValue({ data: [{ id: 'b1', name: 'Asosiy' }] });
  api.listServices.mockResolvedValue({ data: [] });
  api.getQueueToday.mockResolvedValue({
    data: [
      {
        id: 't1',
        tenantId: 'tn',
        branchId: 'b1',
        patientId: OLD.id,
        serviceId: null,
        doctorId: null,
        appointmentId: null,
        queueNumber: 4,
        ticketDate: '2026-11-20',
        status: 'waiting',
        calledAt: null,
        finishedAt: null,
        createdAt: new Date().toISOString(),
      },
    ],
  });
  api.getCheckInCandidates.mockResolvedValue({
    data: [
      {
        id: 'a1',
        patientId: OLD.id,
        serviceIds: [],
        startTime: '2026-11-20T05:00:00Z',
        status: 'scheduled',
      },
    ],
  });
});

describe('FX-92 navbat: bemor ismi 100 talik ro‘yxatdan tashqari bemorlar uchun', () => {
  it('QueueBoard: kartada va check-in qatorida ism chiqadi', async () => {
    renderApp(<QueueBoard />);
    await waitFor(() => expect(screen.getAllByText('Eski Bemorov').length).toBeGreaterThan(0));
  });

  it('CheckInDialog: yozilishdan ro‘yxatda ism chiqadi', async () => {
    renderApp(<CheckInDialog opened onClose={() => {}} branchId="b1" />);
    await waitFor(() => expect(screen.getByText('Eski Bemorov')).toBeInTheDocument());
  });
});
