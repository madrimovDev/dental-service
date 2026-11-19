import { ROLE_TEMPLATES } from '@dental/core';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth-store.ts';
import { renderApp } from '../../../test-utils';
import { AssistantDashboard } from './AssistantDashboard.tsx';

/**
 * FX-132 — Nurse (real shablon permset: appointment.view + patient.view, appointment.create
 * YO'Q): bemor ustuni «—» emas, ism; «Yangi yozilish» tugmasi yashirin.
 */
const api = vi.hoisted(() => ({
  listAppointments: vi.fn(async () => ({
    success: true,
    data: [
      {
        id: 'a1',
        patientId: 'p1',
        startTime: '2026-11-20T09:00:00.000Z',
        endTime: '2026-11-20T09:30:00.000Z',
        status: 'scheduled',
      },
    ],
  })),
  getPatient: vi.fn(async () => ({ success: true, data: { id: 'p1', fullName: 'Aliyev Vali' } })),
}));

vi.mock('@dental/api-client', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  ...api,
}));

const nursePerms = () => {
  const t = ROLE_TEMPLATES.find((x) => x.templateKey === 'nurse');
  if (!t) throw new Error('nurse template');
  return [...t.permissions];
};

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockClear();
});
afterEach(() => useAuthStore.setState({ permissions: [], activeBranchId: null }));

describe('AssistantDashboard (Nurse)', () => {
  it("precondition: appointment.create YO'Q, patient.view bor", () => {
    expect(nursePerms()).not.toContain('appointment.create');
    expect(nursePerms()).toContain('patient.view');
  });

  it("bemor ismi ko'rinadi, «Yangi yozilish» tugmasi yo'q", async () => {
    useAuthStore.setState({ permissions: nursePerms(), activeBranchId: 'b1' });
    renderApp(<AssistantDashboard />);
    await waitFor(() => expect(screen.getByText('Aliyev Vali')).toBeTruthy());
    expect(api.getPatient).toHaveBeenCalledWith('p1');
    expect(screen.queryByText('Yangi yozilish')).toBeNull();
  });

  it("appointment.create bilan «Yangi yozilish» tugmasi ko'rinadi", async () => {
    useAuthStore.setState({
      permissions: [...nursePerms(), 'appointment.create'],
      activeBranchId: 'b1',
    });
    renderApp(<AssistantDashboard />);
    await waitFor(() => expect(screen.getByText('Yangi yozilish')).toBeTruthy());
  });
});
