export const settingsKeys = {
  all: ['settings'] as const,
  roles: () => ['settings', 'roles'] as const,
  role: (id: string) => ['settings', 'role', id] as const,
  permissions: () => ['settings', 'permissions'] as const,
  users: () => ['settings', 'users'] as const,
  staffProfile: (userId: string) => ['settings', 'staff-profile', userId] as const,
  branches: () => ['settings', 'branches'] as const,
  tenant: () => ['settings', 'tenant'] as const,
  tenantSettings: () => ['tenant-settings'] as const,
};
