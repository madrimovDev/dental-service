import { ROLE_TEMPLATES } from '@dental/core';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth-store.ts';
import { renderApp } from '../test-utils';
import { Sidebar } from './Sidebar';

/**
 * FX-23: Sidebar «Bosh sahifa» yonidagi Telegram bron so'rovlari badge'i. Haqiqiy auth-store +
 * react-query + rol shablonlari; faqat transport kuzatiladi.
 */
const api = vi.hoisted(() => ({
  listBookingRequests: vi.fn(async () => ({
    success: true,
    data: { items: [], pendingCount: 3 },
  })),
}));
vi.mock('@dental/api-client', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  ...api,
}));
vi.mock('@/features/license', () => ({
  useLicenseStatus: () => ({ data: { mode: 'cloud', state: 'active' } }),
}));
vi.mock('@/features/auth', () => ({
  useWorkspaceBranches: () => ({ data: null }),
  useBranchSwitch: () => ({ mutate: vi.fn(), isPending: false }),
}));

const login = (key: string) => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === key);
  if (!t) throw new Error(key);
  useAuthStore.setState({ permissions: [...t.permissions], activeBranchId: 'b1', roleKey: key });
};

beforeEach(() => api.listBookingRequests.mockClear());
afterEach(() => useAuthStore.setState({ permissions: [], activeBranchId: null, roleKey: null }));

describe("Sidebar — Telegram bron so'rovlari badge", () => {
  it("registrator (appointment.create): Bosh sahifa yonida kutilayotgan soni ko'rinadi", async () => {
    login('receptionist');
    renderApp(<Sidebar />);
    const badge = await screen.findByTitle("Telegram bron so'rovlari");
    expect(badge).toHaveTextContent('3');
    expect(api.listBookingRequests).toHaveBeenCalledWith({ status: 'pending' });
  });

  it("hamshira (appointment.create yo'q): badge yo'q va so'rov yuborilmaydi", async () => {
    login('nurse');
    renderApp(<Sidebar />);
    await new Promise((r) => setTimeout(r, 50));
    await waitFor(() => expect(screen.queryByTitle("Telegram bron so'rovlari")).toBeNull());
    expect(api.listBookingRequests).not.toHaveBeenCalled();
  });
});
