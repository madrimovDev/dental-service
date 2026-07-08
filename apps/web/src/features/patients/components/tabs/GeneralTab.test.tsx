import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { GeneralTab } from './GeneralTab';

const refetchMock = vi.fn();
const updateMutate = vi.fn();

const rawPatient = {
  id: 'p1',
  fullName: 'Ali Valiyev',
  dateOfBirth: '1990-01-01',
  gender: 'male' as const,
  phone: '+998901234567',
  phoneSecondary: null as string | null,
  passport: 'AB1234567',
  address: 'Toshkent',
  notes: null as string | null,
};

const dataResult = { data: rawPatient, isLoading: false, isError: false, refetch: refetchMock };
// biome-ignore lint/suspicious/noExplicitAny: test-only mutable mock result
let rawResult: any = dataResult;
let canEdit = true;

vi.mock('../../patients.api', () => ({
  usePatientRaw: () => rawResult,
  useUpdatePatient: () => ({ mutate: updateMutate, isPending: false }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    hasPermission: (code: string) => (code === 'patient.edit' ? canEdit : false),
  }),
}));

const patientDetail = {
  id: 'p1',
  fullName: 'Ali Valiyev',
  phone: '+998901234567',
  phoneSecondary: null,
  dateOfBirthFormatted: '01.01.1990',
  age: 36,
  genderLabel: 'Erkak',
  passport: 'AB1234567',
  address: 'Toshkent',
  notes: null,
  tags: [],
  source: null,
  insurance: null,
  insuranceStatus: 'none' as const,
  archived: false,
};

describe('GeneralTab — GeneralReadOnly', () => {
  beforeEach(() => {
    canEdit = false;
  });

  it("patient.edit ruxsati bo'lmasa o'qish-uchun ko'rinishni ko'rsatadi", () => {
    renderApp(<GeneralTab patient={patientDetail} />);
    expect(screen.getByText('AB1234567')).toBeInTheDocument();
  });
});

describe('GeneralTab — GeneralEditForm (StateView, CLI-467)', () => {
  beforeEach(() => {
    canEdit = true;
    rawResult = dataResult;
    updateMutate.mockClear();
    refetchMock.mockClear();
  });

  it('isLoading holatida loading skeleton ko‘rsatadi', () => {
    rawResult = { data: undefined, isLoading: true, isError: false, refetch: refetchMock };
    renderApp(<GeneralTab patient={patientDetail} />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('isError holatida error StateView ko‘rsatadi va retry refetch chaqiradi', () => {
    rawResult = { data: undefined, isLoading: false, isError: true, refetch: refetchMock };
    renderApp(<GeneralTab patient={patientDetail} />);
    expect(document.querySelector('[data-state="error"]')).not.toBeNull();
    fireEvent.click(screen.getByText('Qayta urinish'));
    expect(refetchMock).toHaveBeenCalled();
  });
});

describe('GeneralTab — GeneralEditForm submit payload (CLI-455 frontend)', () => {
  beforeEach(() => {
    canEdit = true;
    rawResult = dataResult;
    updateMutate.mockClear();
  });

  it("original qiymatga ega maydonni bo'shatib submit qilsa null yuboradi (aniq tozalash)", () => {
    renderApp(<GeneralTab patient={patientDetail} />);
    const passportInput = screen.getByLabelText('Passport') as HTMLInputElement;
    fireEvent.change(passportInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(updateMutate).toHaveBeenCalledWith(expect.objectContaining({ passport: null }));
  });

  // Ticket asosiy misoli: `phone` — PhoneInput +998 prefiksni tashlab digits bilan
  // ishlaydi, bo'shatilganda onChange('') chaqiradi (bu ham 'aniq tozalash' yo'li).
  it("original telefon bo'lgan maydonni bo'shatib submit qilsa phone: null yuboradi", () => {
    renderApp(<GeneralTab patient={patientDetail} />);
    const phoneInput = screen.getByLabelText('Telefon') as HTMLInputElement;
    fireEvent.change(phoneInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(updateMutate).toHaveBeenCalledWith(expect.objectContaining({ phone: null }));
  });

  it("hech qachon qiymatga ega bo'lmagan maydonni tegmasdan submit qilsa undefined yuboradi (o'zgarish yo'q)", () => {
    renderApp(<GeneralTab patient={patientDetail} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    // notes original ham null edi, foydalanuvchi tegmadi → undefined (kalit o'zgarishsiz).
    expect(updateMutate).toHaveBeenCalledWith(expect.objectContaining({ notes: undefined }));
  });

  it('yangi qiymat kiritilgan maydonni o‘sha qiymat bilan yuboradi', () => {
    renderApp(<GeneralTab patient={patientDetail} />);
    const addressInput = screen.getByLabelText('Manzil') as HTMLInputElement;
    fireEvent.change(addressInput, { target: { value: 'Samarqand' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(updateMutate).toHaveBeenCalledWith(expect.objectContaining({ address: 'Samarqand' }));
  });
});
