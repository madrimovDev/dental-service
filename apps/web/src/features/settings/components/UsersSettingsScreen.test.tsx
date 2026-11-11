import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { UsersSettingsScreen } from './UsersSettingsScreen';

const inviteMutate = vi.hoisted(() => vi.fn());
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
        pending: false,
      },
      {
        assignmentId: 'a3',
        userId: 'u3',
        userEmail: null,
        userPhone: '+998907778899',
        userFullName: 'Kutuvchi Xodim',
        branchId: 'b1',
        branchName: 'Asosiy',
        roleId: 'r1',
        roleName: 'Doctor',
        validFrom: '2026-01-01',
        validTo: null,
        isActive: true,
        pending: true,
      },
    ],
  }),
  useRoles: () => ({ data: [] }),
  useBranches: () => ({ data: [] }),
  useInviteUser: () => ({ mutate: inviteMutate, isPending: false }),
  useRemoveAssignment: () => ({ mutate: vi.fn(), isPending: false }),
  useResetPassword: () => ({ mutate: vi.fn(), isPending: false }),
}));
const perms = vi.hoisted(() => ({ value: ['@owner'] as string[] }));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    permissions: perms.value,
    hasPermission: (c: string) => perms.value.includes('@owner') || perms.value.includes(c),
    user: { id: 'me' },
  }),
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

  it("reset ikonkasi owner'ga ko'rinadi", () => {
    perms.value = ['@owner'];
    renderApp(<UsersSettingsScreen />);
    expect(screen.getAllByLabelText('Parolni qayta tiklash').length).toBeGreaterThan(0);
  });

  it("user.manage bor, lekin owner bo'lmagan foydalanuvchida reset ikonkasi yo'q (P6)", () => {
    perms.value = ['user.manage'];
    renderApp(<UsersSettingsScreen />);
    expect(screen.queryByLabelText('Parolni qayta tiklash')).not.toBeInTheDocument();
    perms.value = ['@owner'];
  });

  it("kutilayotgan a'zoda «Kutilmoqda» belgisi bor va reset tugmasi yo'q (P6 FU-08)", () => {
    perms.value = ['@owner'];
    renderApp(<UsersSettingsScreen />);
    expect(screen.getByText('Kutilmoqda')).toBeInTheDocument();
    expect(
      screen.getByText('Kutilmoqda').closest('[data-meaning]')?.getAttribute('data-meaning'),
    ).toBe('waiting'); // UI-0: StatusPill waiting
    // 2 ta qabul qilingan a'zo uchun reset, kutilayotgan uchun yo'q
    expect(screen.getAllByLabelText('Parolni qayta tiklash')).toHaveLength(2);
  });
});
