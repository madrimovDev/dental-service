import { ROLE_TEMPLATES } from '@dental/core';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth-store.ts';
import { renderApp } from '../../../../test-utils';
import { TelegramRequests } from './TelegramRequests.tsx';

/**
 * FX-23: Telegram bron so'rovlari umumiy widget'i. Haqiqiy `useAuthStore` + haqiqiy
 * react-query + haqiqiy rol shablonlari (permset) — faqat transport (`@dental/api-client`)
 * kuzatiladi, shuning uchun ruxsat/gate mantig'i spy bilan maskalanmaydi.
 */
const api = vi.hoisted(() => {
  const row = (id: string, patientName: string, status: string) => ({
    id,
    status,
    requestedStart: '2026-11-20T05:00:00.000Z',
    createdAt: '2026-11-19T05:00:00.000Z',
    branchId: 'b1',
    branchName: 'Markaziy',
    patientId: 'p1',
    patientName,
    doctorId: 'd1',
    doctorName: 'Dr. Karimov',
    rescheduleOfAppointmentId: null,
    appointmentId: null,
    declineReason: null,
  });
  return {
    listBookingRequests: vi.fn(async ({ status }: { status: string }) => ({
      success: true,
      data:
        status === 'expired'
          ? { items: [row('e1', 'Eskirgan Bemor', 'expired')], pendingCount: 1 }
          : { items: [row('r1', 'Yangi Bemor', 'pending')], pendingCount: 1 },
    })),
    confirmBookingRequest: vi.fn(),
    declineBookingRequest: vi.fn(),
    listDoctors: vi.fn(async () => ({ success: true, data: [] })),
  };
});

vi.mock('@dental/api-client', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  ...api,
}));

const permsOf = (key: string): string[] => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === key);
  if (!t) throw new Error(`template: ${key}`);
  return [...t.permissions];
};
const login = (key: string) =>
  useAuthStore.setState({ permissions: permsOf(key), activeBranchId: 'b1' });

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockClear();
});
afterEach(() => useAuthStore.setState({ permissions: [], activeBranchId: null }));

describe('TelegramRequests', () => {
  it("«Muddati o'tgan» tab: status=expired so'raladi, qator ko'rinadi, amal tugmalari YO'Q", async () => {
    login('receptionist');
    renderApp(<TelegramRequests />);
    expect(await screen.findByText('Yangi Bemor')).toBeInTheDocument();
    // Tab ochilmaguncha expired so'rovi yuborilmaydi.
    expect(api.listBookingRequests).not.toHaveBeenCalledWith({ status: 'expired' });

    fireEvent.click(screen.getByRole('radio', { name: /Muddati o'tgan/ }));
    expect(await screen.findByText('Eskirgan Bemor')).toBeInTheDocument();
    expect(api.listBookingRequests).toHaveBeenCalledWith({ status: 'expired' });
    expect(screen.queryByRole('button', { name: 'Tasdiqlash' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rad etish' })).toBeNull();
  });

  it("compact: filial mudiri (appointment.create) kutilayotgan so'rovni ko'radi", async () => {
    login('branch_manager');
    renderApp(<TelegramRequests compact />);
    expect(await screen.findByText('Yangi Bemor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tasdiqlash' })).toBeInTheDocument();
  });

  it("compact: appointment.create yo'q rol (hamshira) — widget chizilmaydi va so'rov yuborilmaydi", async () => {
    login('nurse');
    expect(permsOf('nurse')).not.toContain('appointment.create');
    renderApp(<TelegramRequests compact />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Yangi Bemor')).toBeNull();
    expect(api.listBookingRequests).not.toHaveBeenCalled();
  });

  it("compact: so'rov yo'q bo'lsa hech narsa chizilmaydi (shovqin yo'q)", async () => {
    login('doctor');
    api.listBookingRequests.mockResolvedValueOnce({
      success: true,
      data: { items: [], pendingCount: 0 },
    });
    renderApp(<TelegramRequests compact />);
    await waitFor(() => expect(api.listBookingRequests).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByText('Telegram')).toBeNull();
  });
});
