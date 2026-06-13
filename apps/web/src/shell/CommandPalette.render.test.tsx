import { spotlight } from '@mantine/spotlight';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test-utils';
import { CommandPalette } from './CommandPalette';

// Owner — bemor ham, xodim ham qidiriladi.
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true, permissions: ['@owner'] }),
}));
vi.mock('@/features/settings/settings.api.ts', () => ({
  useVertical: () => 'dental',
  useUsers: () => ({
    data: [{ userId: 'u1', userFullName: 'Doktor Salimov', userPhone: '+998901112233' }],
  }),
}));
// Bemor nomi 'salim' bilan mos EMAS — natija faqat keywords (CLI-152) orqali ko'rinishi mumkin.
vi.mock('@/features/patients/patients.api.ts', () => ({
  usePatients: () => ({
    data: { items: [{ id: 'p1', fullName: 'Bemorov Aliboy', phone: '+998900000000' }] },
  }),
}));
vi.mock('@mantine/hooks', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useDebouncedValue: (v: unknown) => [v] };
});

// Bitta test — Spotlight global/portal holatini testlar orasida bo'lishmaslik uchun
// alohida faylda (render assertion'lar multi-test faylda mo'rt bo'ladi).
describe('CommandPalette natija render (CLI-163)', () => {
  it("'salim' query xodim va bemor natijalarini ko'rsatadi", async () => {
    renderApp(<CommandPalette />);
    act(() => spotlight.open());
    const input = await screen.findByPlaceholderText(/Bemor, yozuv/);
    fireEvent.change(input, { target: { value: 'salim' } });

    await waitFor(() => {
      const text = document.body.textContent ?? '';
      // xodim — nom (Doktor Salimov) 'salim' ga mos
      expect(text).toContain('+998901112233');
      // bemor — nom (Bemorov Aliboy) mos emas, lekin keywords orqali server natijasi ko'rinadi
      expect(text).toContain('+998900000000');
    });
  });
});
