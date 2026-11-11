import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  roles: [
    {
      id: 'r1',
      name: 'Receptionist',
      description: null,
      isSystem: true,
      isTemplate: true,
      tenantId: 't',
      createdAt: '',
      updatedAt: '',
    },
  ],
  detail: { id: 'r1', permissions: ['patient.view'] },
  perms: [
    {
      id: '1',
      code: 'patient.view',
      category: 'patient',
      descriptionUz: "Bemorlarni ko'rish",
      descriptionRu: null,
    },
    {
      id: '2',
      code: 'cashier.refund',
      category: 'cashier',
      descriptionUz: 'Qaytarim qilish',
      descriptionRu: null,
    },
  ],
  users: [] as never[],
}));

import { renderApp } from '../../../test-utils';
import { RolesSettingsScreen } from './RolesSettingsScreen';

vi.mock('../settings.api', () => ({
  useRoles: () => ({ data: fixtures.roles }),
  useRole: () => ({ data: fixtures.detail }),
  usePermissions: () => ({ data: fixtures.perms }),
  useUsers: () => ({ data: fixtures.users }),
  useUpsertRole: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRole: () => ({ mutate: vi.fn(), isPending: false }),
  useRolePermissionMap: () => new Map(),
  useBranches: () => ({ data: [] }),
  useTenant: () => ({ data: null }),
  useReadiness: () => ({ data: undefined }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    permissions: ['role.manage'],
    hasPermission: () => true,
    user: { id: 'me' },
  }),
}));

describe('RolesSettingsScreen', () => {
  it("rol kartasi «qila oladi / qila olmaydi» ni katalogdan ko'rsatadi", () => {
    renderApp(<RolesSettingsScreen />);
    expect(screen.getByTestId('role-can')).toHaveTextContent("Bemorlarni ko'rish");
    expect(screen.getByTestId('role-cannot')).toHaveTextContent('Qaytarim qilish');
  });
});
