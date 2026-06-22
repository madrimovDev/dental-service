import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  sidebarRail: boolean;
  toggleSidebarRail: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarRail: false,
      toggleSidebarRail: () => set((s) => ({ sidebarRail: !s.sidebarRail })),
    }),
    { name: 'dental-ui' },
  ),
);
