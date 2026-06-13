import { spotlight } from '@mantine/spotlight';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test-utils';
import { CommandPalette } from './CommandPalette';

// Bemor qidiruvi har doim yoqilgan (patient.view), xodim — mockCanUser bilan boshqariladi.
let mockCanUser = true;
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    hasPermission: (p: string) => p === 'patient.view' || (p === 'user.view' && mockCanUser),
    permissions: [],
  }),
}));

// useUsers chaqiruv argumentini (enabled gate) kuzatamiz — RBAC himoyasi shu yerda.
const useUsersSpy = vi.fn((_opts?: { enabled?: boolean }) => ({ data: [] }));
vi.mock('@/features/settings/settings.api.ts', () => ({
  useVertical: () => 'dental',
  useUsers: (opts?: { enabled?: boolean }) => useUsersSpy(opts),
}));

vi.mock('@/features/patients/patients.api.ts', () => ({
  usePatients: () => ({ data: { items: [] } }),
}));

// debounce'ni o'tkazib, query darhol uzatilsin
vi.mock('@mantine/hooks', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useDebouncedValue: (v: unknown) => [v] };
});

afterEach(() => {
  act(() => spotlight.close());
  useUsersSpy.mockClear();
  mockCanUser = true;
});

async function openAndType(text: string) {
  act(() => spotlight.open());
  const input = await screen.findByPlaceholderText(/Bemor, yozuv/);
  fireEvent.change(input, { target: { value: text } });
}

// RBAC gate — xodim so'rovi listUserAssignments (user.view) faqat ruxsat bo'lganda
// yuborilishi shart (ruxsatsiz rolda 403 oldini oladi). Gate'ni useUsers'ning
// 'enabled' argumenti orqali tasdiqlaymiz (render'ga bog'liq emas, barqaror).
describe('CommandPalette xodim qidiruvi RBAC gate (CLI-163)', () => {
  it("user.view bor → query bilan xodim so'rovi yoqiladi", async () => {
    renderApp(<CommandPalette />);
    await openAndType('salim');
    await waitFor(() => expect(useUsersSpy).toHaveBeenCalledWith({ enabled: true }));
  });

  it("user.view yo'q → xodim so'rovi hech qachon yoqilmaydi (403 oldini oladi)", async () => {
    mockCanUser = false;
    renderApp(<CommandPalette />);
    await openAndType('salim');
    // bir necha render'dan keyin ham enabled:true bo'lmaydi
    await waitFor(() => expect(useUsersSpy).toHaveBeenCalledWith({ enabled: false }));
    expect(useUsersSpy).not.toHaveBeenCalledWith({ enabled: true });
  });
});
