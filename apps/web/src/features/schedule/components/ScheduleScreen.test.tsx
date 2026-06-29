import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { ScheduleScreen } from './ScheduleScreen';

// appointments.api — screen `@/` orqali import qiladi.
vi.mock('@/features/appointments/appointments.api', () => ({
  useDoctors: () => ({ data: [{ id: 'd1', name: 'Doktor Aliyev' }] }),
  useBranches: () => ({ data: [{ id: 'b1', name: 'Markaziy filial' }] }),
}));

// schedule.api — bolalar (editor/list/form) relativ import qiladi. Hech qanday
// haqiqiy so'rov yubormaydigan stub'lar.
vi.mock('../schedule.api', () => ({
  useWorkingHours: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useSaveWorkingHours: () => ({ mutate: vi.fn(), isPending: false }),
  useTimeOff: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useCreateTimeOff: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTimeOff: () => ({ mutate: vi.fn(), isPending: false }),
}));

// auth-store — activeBranchId truthy bo'lishi SHART (branchId shundan boshlanadi,
// shuning uchun editor branch-guard'idan o'tadi). hasPermission ham SHU obyektda.
let perms = new Set<string>(['schedule.manage']);
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    activeBranchId: 'b1',
    hasPermission: (p: string) => perms.has(p),
  }),
}));

/** Doktor Select'ni ochib doktorni tanlaydi → editor body render bo'ladi. */
async function selectDoctor() {
  const doctorInput = screen.getByPlaceholderText('Shifokorni tanlang');
  fireEvent.click(doctorInput);
  fireEvent.click(await screen.findByText('Doktor Aliyev'));
}

describe('ScheduleScreen', () => {
  beforeEach(() => {
    perms = new Set(['schedule.manage']);
  });

  it("subtitle ko'rsatadi", () => {
    renderApp(<ScheduleScreen />);
    expect(screen.getByText('Haftalik ish vaqti · mavjudlik')).toBeInTheDocument();
  });

  it('doktor va filial Select ikkalasini ham render qiladi', () => {
    renderApp(<ScheduleScreen />);
    // Har Select o'z placeholder'i bilan (label matni nav bilan to'qnashadi).
    expect(screen.getByPlaceholderText('Shifokorni tanlang')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Filialni tanlang')).toBeInTheDocument();
  });

  it("doktor tanlangach ish soatlari tabida hafta kunlari ko'rinadi", async () => {
    renderApp(<ScheduleScreen />);
    await selectDoctor();
    // Hours tab default → weekday label'lar render bo'ladi.
    expect(screen.getByText('Dushanba')).toBeInTheDocument();
  });

  it("ta'til tabiga o'tganda time-off ro'yxati ko'rinadi", async () => {
    renderApp(<ScheduleScreen />);
    await selectDoctor();
    fireEvent.click(screen.getByText("Dam olish / ta'til"));
    // schedule.manage bor → "Yangi ta'til" tugmasi ko'rinadi (editor body render bo'ldi).
    expect(screen.getByRole('button', { name: "Yangi ta'til" })).toBeInTheDocument();
    // Hours tab body endi yo'q.
    expect(screen.queryByText('Dushanba')).not.toBeInTheDocument();
  });

  it("schedule.manage YO'Q bo'lsa boshqaruv tugmalari yashirin", async () => {
    perms = new Set(); // ruxsatsiz
    renderApp(<ScheduleScreen />);
    await selectDoctor();
    // Hours tab: "Saqlash" va "Oraliq qo'shish" yo'q.
    expect(screen.queryByRole('button', { name: 'Saqlash' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Oraliq qo'shish" })).not.toBeInTheDocument();
    // Time-off tab: "Yangi ta'til" yo'q.
    fireEvent.click(screen.getByText("Dam olish / ta'til"));
    expect(screen.queryByRole('button', { name: "Yangi ta'til" })).not.toBeInTheDocument();
  });
});
