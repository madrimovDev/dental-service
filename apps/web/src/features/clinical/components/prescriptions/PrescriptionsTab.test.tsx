import { ApiError } from '@dental/api-client';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { PrescriptionsTab } from './PrescriptionsTab';

const mutate = vi.fn();
let medical: {
  data?: { allergies: Array<{ substance: string }> | null };
  isError: boolean;
  isLoading: boolean;
};
let serverError: unknown = null;

vi.mock('../../clinical.api', () => ({
  usePrescriptions: () => ({ data: [], isLoading: false }),
  useCreatePrescription: () => ({
    mutate: (body: unknown, opts?: { onError?: (e: unknown) => void }) => {
      mutate(body);
      if (serverError) opts?.onError?.(serverError);
    },
    isPending: false,
  }),
}));
vi.mock('@/features/patients/patients.api', () => ({
  useMedicalRecord: () => medical,
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ user: { id: 'u1' }, hasPermission: () => true }),
}));

type Author = {
  canSelf: boolean;
  canOnBehalf: boolean;
  options: { value: string; label: string }[];
  canAuthor: boolean;
  showPicker: boolean;
  defaultDoctorId: string | null;
  isLoading: boolean;
};
const selfAuthor: Author = {
  canSelf: true,
  canOnBehalf: false,
  options: [{ value: 'u1', label: 'Men' }],
  canAuthor: true,
  showPicker: false,
  defaultDoctorId: 'u1',
  isLoading: false,
};
let author: Author = selfAuthor;
vi.mock('../../clinical-author', () => ({
  useClinicalAuthor: () => author,
}));

const fillAndSave = async (drug: string) => {
  renderApp(<PrescriptionsTab patientId="p1" />);
  fireEvent.click(screen.getByText('Yangi resept'));
  fireEvent.click(await screen.findByText("Dori qo'shish"));
  fireEvent.change(await screen.findByLabelText('Dori nomi'), { target: { value: drug } });
  fireEvent.change(screen.getByLabelText('Dozasi'), { target: { value: '500mg' } });
  fireEvent.change(screen.getByLabelText('Qabul qilish chastotasi'), {
    target: { value: '3x' },
  });
  fireEvent.click(screen.getByText('Reseptni saqlash'));
};

describe('PrescriptionsTab', () => {
  beforeEach(() => {
    mutate.mockClear();
    medical = { data: { allergies: null }, isError: false, isLoading: false };
    serverError = null;
    author = selfAuthor;
  });

  it('FX-155: shifokor emas va on_behalf yo‘q (Branch Manager) → «Yangi resept» ko‘rinmaydi', () => {
    author = {
      ...selfAuthor,
      canSelf: false,
      options: [],
      canAuthor: false,
      defaultDoctorId: null,
    };
    renderApp(<PrescriptionsTab patientId="p1" />);
    expect(screen.queryByText('Yangi resept')).not.toBeInTheDocument();
  });

  it('FX-155: on_behalf (Tenant Admin) — shifokor tanlanmaguncha saqlanmaydi; tanlangan doctorId ketadi', async () => {
    author = {
      canSelf: false,
      canOnBehalf: true,
      options: [
        { value: 'doc-a', label: 'Doc A' },
        { value: 'doc-b', label: 'Doc B' },
      ],
      canAuthor: true,
      showPicker: true,
      defaultDoctorId: null,
      isLoading: false,
    };
    await fillAndSave('Amoxicillin');
    expect(screen.getByRole('button', { name: 'Reseptni saqlash' })).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('textbox', { name: 'Shifokor' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Doc B' }));
    fireEvent.click(screen.getByText('Reseptni saqlash'));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate.mock.calls[0]?.[0]).toMatchObject({ doctorId: 'doc-b' });
  });

  it("dori qo'shib saqlash → createPrescription chaqiradi", async () => {
    await fillAndSave('Amoxicillin');
    await waitFor(() => expect(mutate).toHaveBeenCalled());
    expect(mutate.mock.calls[0]?.[0]).toMatchObject({ doctorId: 'u1' });
  });

  it('FX-22: allergiyaga zid dori → kritik oyna, sabab tanlanmaguncha yuborilmaydi; sabab bilan override ketadi', async () => {
    medical = {
      data: { allergies: [{ substance: 'Penitsillin' }] },
      isError: false,
      isLoading: false,
    };
    await fillAndSave('Amoksitsillin');
    expect(await screen.findByText('Allergiya ogohlantirishi')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Baribir davom etish' })).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Bemor xabardor, rozi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Baribir davom etish' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
    expect(mutate.mock.calls[0]?.[0]).toMatchObject({
      allergyOverrides: [
        {
          drug: 'Amoksitsillin',
          group: 'penicillin',
          allergen: 'Penitsillin',
          reason: 'patient_informed',
        },
      ],
    });
  });

  it('FX-22: allergiya noma‘lum (xato/403) → kritik oyna, tasdiqsiz yuborilmaydi', async () => {
    medical = { isError: true, isLoading: false };
    await fillAndSave('Ibuprofen');
    expect(await screen.findByText('Allergiya ma’lumoti noma’lum')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: 'Allergiya og‘zaki so‘rab tekshirildi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Baribir davom etish' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1));
  });

  it('FX-22: server 409 → kritik oyna', async () => {
    serverError = new ApiError('prescription.allergy_conflict', 'conflict', 409, [
      { drug: 'Ibuprofen', group: 'nsaid', allergen: 'Aspirin' },
    ]);
    await fillAndSave('Ibuprofen');
    expect(await screen.findByText('Allergiya ogohlantirishi')).toBeInTheDocument();
  });
});
