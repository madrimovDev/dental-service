import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AuthUser = {
  id: string;
  phone: string;
  fullName: string | null;
  lang: string;
};

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  activeTenantId: string | null;
  activeBranchId: string | null;
  permissions: string[];
  roleKey: string | null;

  setTokens: (access: string, refresh: string) => void;
  setUser: (user: AuthUser) => void;
  setContext: (
    tenantId: string | null,
    branchId: string | null,
    perms: string[],
    roleKey?: string | null,
  ) => void;
  hasPermission: (code: string) => boolean;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      activeTenantId: null,
      activeBranchId: null,
      permissions: [],
      roleKey: null,

      setTokens: (access, refresh) => set({ accessToken: access, refreshToken: refresh }),
      setUser: (user) => set({ user }),
      setContext: (tenantId, branchId, perms, roleKey = null) =>
        set({
          activeTenantId: tenantId,
          activeBranchId: branchId,
          permissions: perms,
          roleKey,
        }),

      hasPermission: (code) => {
        const { permissions } = get();
        return permissions.includes('@owner') || permissions.includes(code);
      },

      clear: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          activeTenantId: null,
          activeBranchId: null,
          permissions: [],
          roleKey: null,
        }),
    }),
    { name: 'dental-auth' },
  ),
);
