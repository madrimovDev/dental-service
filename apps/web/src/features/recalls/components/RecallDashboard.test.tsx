import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import type { RecallDto } from '../recalls.types';
import { RecallDashboard } from './RecallDashboard';

const markContactedMutate = vi.fn();
const updateMutate = vi.fn();
let recalls: RecallDto[] = [];
let isLoading = false;
let isError = false;

vi.mock('../recalls.api', () => ({
  useRecalls: () => ({
    data: recalls,
    isLoading,
    isError,
    refetch: vi.fn(),
  }),
  useRecallSummary: () => ({ data: undefined }),
  useMarkRecallContacted: () => ({ mutate: markContactedMutate, isPending: false }),
  useUpdateRecall: () => ({ mutate: updateMutate, isPending: false }),
}));

let perms = new Set<string>(['recall.view', 'recall.manage', 'patient.view_pii']);
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: (p: string) => perms.has(p) }),
}));

function makeRecall(over: Partial<RecallDto> = {}): RecallDto {
  return {
    id: 'r1',
    tenantId: 't1',
    branchId: 'b1',
    patientId: 'p1',
    patientName: 'Ali Valiyev',
    patientPhone: '+998901234567',
    reason: 'preventive',
    status: 'pending',
    source: 'manual',
    dueDate: '2026-06-20',
    intervalMonths: 6,
    sourceStageId: null,
    treatmentPlanId: null,
    scheduledAppointmentId: null,
    assignedDoctorId: null,
    lastContactedAt: null,
    contactAttempts: 0,
    smsStatus: null,
    notes: null,
    createdBy: null,
    closedBy: null,
    closedAt: null,
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z',
    ...over,
  };
}

describe('RecallDashboard', () => {
  beforeEach(() => {
    markContactedMutate.mockClear();
    updateMutate.mockClear();
    recalls = [];
    isLoading = false;
    isError = false;
    perms = new Set(['recall.view', 'recall.manage', 'patient.view_pii']);
  });

  it("bo'sh ro'yxatda empty holatni ko'rsatadi", () => {
    renderApp(<RecallDashboard />);
    expect(screen.getByText("Bugun qayta chaqirish ro'yxati bo'sh")).toBeInTheDocument();
  });

  it("recall qatorini bemor ismi + sabab bilan ko'rsatadi", () => {
    recalls = [makeRecall()];
    renderApp(<RecallDashboard />);
    const row = screen.getByText('Ali Valiyev').closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('Profilaktika');
    expect(row).toHaveTextContent('+998901234567');
  });

  it("'Bog'lanildi' tugmasi markContacted mutatsiyasini recall id bilan chaqiradi", () => {
    recalls = [makeRecall()];
    renderApp(<RecallDashboard />);
    fireEvent.click(screen.getByRole('button', { name: "Bog'lanildi" }));
    expect(markContactedMutate).toHaveBeenCalledWith({ id: 'r1' });
  });

  it("'Bekor qilish' tugmasi status=dismissed bilan update chaqiradi", () => {
    recalls = [makeRecall()];
    renderApp(<RecallDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));
    expect(updateMutate).toHaveBeenCalledWith({ id: 'r1', body: { status: 'dismissed' } });
  });

  it("patient.view_pii yo'q bo'lsa telefon yashiriladi", () => {
    perms = new Set(['recall.view', 'recall.manage']);
    recalls = [makeRecall()];
    renderApp(<RecallDashboard />);
    expect(screen.queryByText('+998901234567')).not.toBeInTheDocument();
  });

  it("recall.manage yo'q bo'lsa amal tugmalari ko'rinmaydi", () => {
    perms = new Set(['recall.view']);
    recalls = [makeRecall()];
    renderApp(<RecallDashboard />);
    expect(screen.queryByRole('button', { name: "Bog'lanildi" })).not.toBeInTheDocument();
  });
});
