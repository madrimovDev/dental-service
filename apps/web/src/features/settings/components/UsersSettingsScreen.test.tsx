import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { UsersSettingsScreen } from './UsersSettingsScreen';

vi.mock('../settings.api', () => ({
  useUsers: () => ({
    data: [
      {
        assignmentId: 'a1',
        userId: 'u1',
        userEmail: null,
        userPhone: '+998901112233',
        userFullName: 'Ali Valiyev',
        branchId: 'b1',
        branchName: 'Asosiy',
        roleId: 'r1',
        roleName: 'Doctor',
        validFrom: '2026-01-01',
        validTo: null,
        isActive: true,
      },
      {
        assignmentId: 'a2',
        userId: 'u2',
        userEmail: null,
        userPhone: '+998935556677',
        userFullName: 'Vali Aliyev',
        branchId: 'b1',
        branchName: 'Asosiy',
        roleId: 'r1',
        roleName: 'Doctor',
        validFrom: '2026-01-01',
        validTo: null,
        isActive: true,
      },
    ],
  }),
  useRoles: () => ({ data: [] }),
  useBranches: () => ({ data: [] }),
  useInviteUser: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useResetPassword: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true, user: { id: 'me' } }),
}));

describe('UsersSettingsScreen', () => {
  it("qidiruv ro'yxatni filtrlaydi", () => {
    renderApp(<UsersSettingsScreen />);
    expect(screen.getByText('Ali Valiyev')).toBeInTheDocument();
    expect(screen.getByText('Vali Aliyev')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Ism yoki telefon bo'yicha qidirish"), {
      target: { value: 'Vali A' },
    });

    expect(screen.queryByText('Ali Valiyev')).not.toBeInTheDocument();
    expect(screen.getByText('Vali Aliyev')).toBeInTheDocument();
  });

  it("faol holat yorlig'i StatusPill matni bilan ko'rinadi", () => {
    renderApp(<UsersSettingsScreen />);
    // Badge -> StatusPill migratsiyasidan keyin ham label matni (users.active) DOM'da
    expect(screen.getAllByText('Faol').length).toBeGreaterThan(0);
  });
});
