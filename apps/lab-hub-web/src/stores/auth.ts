import { create } from 'zustand';

export type LabRole = 'lead' | 'technician';
export type SubscriptionState = 'active' | 'grace' | 'expired';

export type HubUser = {
  id: string;
  fullName: string;
  phone: string;
  role: LabRole;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};
export type HubLab = { id: string; name: string; subscription: SubscriptionState };

type Session = {
  token: string | null;
  user: HubUser | null;
  lab: HubLab | null;
  mustChangePassword: boolean;
};

const KEY = 'lab_hub_session';
const EMPTY: Session = { token: null, user: null, lab: null, mustChangePassword: false };

const load = (): Session => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Session>) } : EMPTY;
  } catch {
    return EMPTY;
  }
};

type AuthState = Session & {
  login: (r: {
    token: string;
    mustChangePassword: boolean;
    user: HubUser;
    lab: HubLab | null;
  }) => void;
  passwordChanged: (token: string, user: HubUser) => void;
  setSubscription: (s: SubscriptionState) => void;
  setMustChangePassword: (v: boolean) => void;
  logout: () => void;
};

export const useAuth = create<AuthState>()((set) => ({
  ...load(),
  login: (r) =>
    set({ token: r.token, user: r.user, lab: r.lab, mustChangePassword: r.mustChangePassword }),
  passwordChanged: (token, user) => set({ token, user, mustChangePassword: false }),
  setSubscription: (s) => set((st) => (st.lab ? { lab: { ...st.lab, subscription: s } } : st)),
  setMustChangePassword: (v) => set({ mustChangePassword: v }),
  logout: () => set({ ...EMPTY }),
}));

// Sessiyani saqlash (token + profil); sirlar — faqat JWT, parol hech qachon saqlanmaydi.
useAuth.subscribe((s) => {
  try {
    if (!s.token) localStorage.removeItem(KEY);
    else
      localStorage.setItem(
        KEY,
        JSON.stringify({
          token: s.token,
          user: s.user,
          lab: s.lab,
          mustChangePassword: s.mustChangePassword,
        } satisfies Session),
      );
  } catch {
    /* private mode */
  }
});
