import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { NewAppointmentWizard } from './NewAppointmentWizard';

const createMock = vi.hoisted(() => vi.fn());
const availabilityMock = vi.hoisted(() => ({
  data: {
    doctorId: 'd1',
    branchId: 'b1',
    date: '2026-06-20',
    slotMinutes: 30,
    slots: [
      // 2026-06-20T04:00:00Z = 09:00 Tashkent
      { start: '2026-06-20T04:00:00.000Z', end: '2026-06-20T04:30:00.000Z' },
      { start: '2026-06-20T04:30:00.000Z', end: '2026-06-20T05:00:00.000Z' },
    ],
  },
  isLoading: false,
}));

vi.mock('../appointments.api', () => ({
  useCreateAppointment: () => ({ mutate: createMock, isPending: false }),
  useDoctors: () => ({ data: [{ id: 'd1', name: 'Dr. Ali' }] }),
  useServices: () => ({
    data: [
      { id: 's1', nameUz: 'Tekshiruv', durationMinutes: 30 },
      { id: 's2', nameUz: 'Tozalash', durationMinutes: 30 },
    ],
  }),
  useBranches: () => ({ data: [{ id: 'b1', name: 'Markaziy filial' }] }),
}));
vi.mock('@/features/schedule/schedule.api', () => ({
  useAvailability: () => availabilityMock,
}));
vi.mock('@/features/patients', () => ({
  usePatients: () => ({ data: { items: [], meta: {} } }),
}));
vi.mock('@/lib/api.ts', () => ({
  api: {
    patients: { list: vi.fn(() => Promise.resolve({ data: [], meta: {} })) },
    services: { list: vi.fn(() => Promise.resolve([])) },
    branches: { list: vi.fn(() => Promise.resolve([])) },
  },
}));

const mockAuth = vi.hoisted(() => ({ activeBranchId: 'b1' as string | null }));
vi.mock('@/stores/auth-store.ts', () => ({ useAuthStore: () => mockAuth }));

describe('NewAppointmentWizard', () => {
  afterEach(() => {
    mockAuth.activeBranchId = 'b1';
    createMock.mockReset();
  });

  it("birinchi qadam (Bemor) ko'rsatadi", () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    expect(screen.getByText('Bemor')).toBeInTheDocument();
  });

  it("branch-bound foydalanuvchida filial Select ko'rsatilmaydi", () => {
    mockAuth.activeBranchId = 'b1';
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    expect(screen.queryByText('Filial')).not.toBeInTheDocument();
  });

  it("tenant-wide foydalanuvchida (activeBranchId=null) filial Select ko'rsatiladi (CLI-151)", () => {
    mockAuth.activeBranchId = null;
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    expect(screen.getByText('Filial')).toBeInTheDocument();
  });

  /** Xizmat (Tekshiruv) tanlaydi — slotMinutes>0 bo'lib availability yoqiladi. */
  async function selectService() {
    fireEvent.click(screen.getByText('Doktor va xizmat'));
    // "Xizmatlar" label wrapper'i ichidagi MultiSelect search input'ini ochamiz.
    const wrapper = screen.getByText('Xizmatlar').closest('.mantine-InputWrapper-root');
    const input = wrapper?.querySelector('input');
    if (!input) throw new Error('Xizmatlar input topilmadi');
    fireEvent.click(input);
    fireEvent.click(await screen.findByText('Tekshiruv'));
  }

  it("vaqt qadamida bo'sh slot chiplari ko'rsatiladi (Tashkent HH:mm)", async () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    await selectService();
    fireEvent.click(screen.getByText('Vaqt'));
    expect(await screen.findByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('09:30')).toBeInTheDocument();
  });

  it("slot tanlanmaguncha Keyingi tugmasi o'chiq, tanlangach yoqiladi", async () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    await selectService();
    fireEvent.click(screen.getByText('Vaqt'));
    const nextBtn = screen.getByRole('button', { name: 'Keyingi' });
    expect(nextBtn).toBeDisabled();
    fireEvent.click(await screen.findByText('09:00'));
    await waitFor(() => expect(nextBtn).not.toBeDisabled());
  });

  it("tanlangan slot startTime/endTime'ni auto-to'ldiradi va submit'ga uzatadi", async () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    await selectService();
    fireEvent.click(screen.getByText('Vaqt'));
    fireEvent.click(await screen.findByText('09:00'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keyingi' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Keyingi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: '2026-06-20T04:00:00.000Z',
        endTime: '2026-06-20T04:30:00.000Z',
      }),
      expect.anything(),
    );
  });

  it("availability bazasi (slotMinutes) o'zgarsa tanlangan slot tozalanadi (stale-guard)", async () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    await selectService();
    fireEvent.click(screen.getByText('Vaqt'));
    fireEvent.click(await screen.findByText('09:00'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keyingi' })).not.toBeDisabled());
    // Xizmat qadamiga qaytib ikkinchi xizmat qo'shamiz → slotMinutes 30→60.
    fireEvent.click(screen.getByText('Doktor va xizmat'));
    const wrapper = screen.getByText('Xizmatlar').closest('.mantine-InputWrapper-root');
    const input = wrapper?.querySelector('input');
    if (!input) throw new Error('Xizmatlar input topilmadi');
    fireEvent.click(input);
    fireEvent.click(await screen.findByText('Tozalash'));
    // Vaqt qadamiga qaytamiz — eski slot tozalangani uchun Keyingi o'chiq.
    fireEvent.click(screen.getByText('Vaqt'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keyingi' })).toBeDisabled());
  });
});
