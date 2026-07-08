import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { CheckInDialog } from './CheckInDialog';

const mutate = vi.fn();

// usePatientsAll chaqiruv argumentini (search) kuzatamiz — CLI-454: debounced
// server-search pageSize:100 bilan cheklangan static ro'yxat o'rniga. Barcha
// chaqiruvlar (qidiruvli/qidiruvsiz) bir xil ma'lumot qaytaradi — testda faqat
// argument bilan qanday chaqirilgani muhim.
const usePatientsAllSpy = vi.hoisted(() =>
  vi.fn((_search?: string) => ({ data: { data: [{ id: 'p1', fullName: 'Ali Valiyev' }] } })),
);

vi.mock('../queue.api', () => ({
  useCheckInCandidates: () => ({
    data: [
      {
        id: 'a1',
        patientId: 'p1',
        serviceIds: ['s1'],
        startTime: '2026-06-11T05:00:00Z',
      },
    ],
  }),
  usePatientsAll: (search?: string) => usePatientsAllSpy(search),
  useServices: () => ({ data: [] }),
  useCreateTicket: () => ({ mutate, isPending: false }),
}));

// debounce'ni o'tkazib, qidiruv darhol uzatilsin (CommandPalette.test.tsx naqshi).
vi.mock('@mantine/hooks', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useDebouncedValue: (v: unknown) => [v] };
});

describe('CheckInDialog', () => {
  it('yozuvdan check-in → appointmentId bilan create chaqiradi', () => {
    renderApp(<CheckInDialog opened onClose={vi.fn()} branchId="b1" />);
    fireEvent.click(screen.getByText('Navbatga olish'));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'b1', appointmentId: 'a1', patientId: 'p1' }),
      expect.anything(),
    );
  });

  // CLI-454: avval walk-in bemor Select faqat oldindan yuklangan (pageSize:100,
  // qidiruvsiz) ro'yxatni client-side filtrlar edi. Endi qidiruv matni debounced
  // holda `usePatientsAll`ga uzatiladi (yozuvdan check-in tab'idagi bemor-nomi
  // qidiruvdan mustaqil qoladi — alohida unscoped chaqiruv saqlanadi).
  it("walk-in bemor qidiruv input o'zgarganda usePatientsAll debounced search bilan chaqiriladi", async () => {
    renderApp(<CheckInDialog opened onClose={vi.fn()} branchId="b1" />);
    fireEvent.click(screen.getByText('Navbat (yozuvsiz)'));
    // getByLabelText 2 ta topadi (input + combobox listbox — ikkalasi ham
    // `aria-labelledby` orqali "Bemor"ga bog'langan) — role bilan input'ga toraytiramiz.
    const input = screen.getByRole('textbox', { name: 'Bemor' });
    fireEvent.change(input, { target: { value: 'Vali' } });
    await waitFor(() => expect(usePatientsAllSpy).toHaveBeenCalledWith('Vali'));
  });
});
