import type { AuditListResponse } from '@dental/api-client';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { AuditScreen } from './AuditScreen';

const response: AuditListResponse = {
  data: [
    {
      id: 'a1',
      tenantId: 't1',
      userId: 'u1',
      action: 'patient.create',
      resourceType: 'patient',
      resourceId: 'p1',
      before: null,
      after: { fullName: 'Test Bemor' },
      ip: '127.0.0.1',
      userAgent: 'vitest',
      createdAt: '2026-06-11T05:30:00Z',
    },
  ],
  meta: { page: 1, pageSize: 50, total: 1 },
};

vi.mock('../audit.api', () => ({
  useAuditLog: () => ({ data: response, isLoading: false }),
  useUserAssignments: () => ({
    data: [
      {
        assignmentId: 'as1',
        userId: 'u1',
        userEmail: null,
        userPhone: '+998901234567',
        userFullName: 'Doktor Aliyev',
        branchId: null,
        branchName: null,
        roleId: 'r1',
        roleName: 'Doctor',
        validFrom: '2026-01-01',
        validTo: null,
        isActive: true,
      },
    ],
  }),
}));

describe('AuditScreen', () => {
  it("qatorni ko'rsatadi: action, resolved user name, when (Tashkent)", () => {
    renderApp(<AuditScreen />);
    expect(screen.getByText('patient.create')).toBeInTheDocument();
    // userId u1 → assignment ismiga resolve (jadval + Select option = 2 match)
    expect(screen.getAllByText('Doktor Aliyev').length).toBeGreaterThan(0);
    // 05:30 UTC → 10:30 Asia/Tashkent
    expect(screen.getByText('11/06/2026 10:30')).toBeInTheDocument();
  });

  it('detail modal: before/after JSON ochiladi', async () => {
    renderApp(<AuditScreen />);
    fireEvent.click(screen.getByText('Tafsilot'));
    expect(await screen.findByText('Keyin')).toBeInTheDocument();
    expect(screen.getByText('Oldin')).toBeInTheDocument();
  });
});
