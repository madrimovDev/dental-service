import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
let canPii = true;

vi.mock('../../patients.api', () => ({
  usePatientRaw: () => rawResult,
  useUpdatePatient: () => ({ mutate: updateMutate, isPending: false }),
  // CLI-474 (L7): NoShowStrikesCard hook'lari — strike yo'q (Card render qilmaydi).
  usePatientNoShowStrikes: () => ({ data: undefined }),
  useWaiveNoShowStrike: () => ({ mutate: () => {}, isPending: false }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    hasPermission: (code: string) =>
      code === 'patient.edit' ? canEdit : code === 'patient.view_pii' ? canPii : false,
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

describe('GeneralTab — PT-04 maskalangan PII qayta yozilmaydi', () => {
  const maskedRaw = {
    ...rawPatient,
    phone: '********4567',
    passport: '***',
    address: '***',
  };

  beforeEach(() => {
    canEdit = true;
    canPii = false;
    rawResult = { ...dataResult, data: maskedRaw };
    updateMutate.mockClear();
  });

  afterEach(() => {
    canPii = true;
  });

  it('view_pii siz: telefon/pasport/manzil o‘qish-uchun (disabled) va izoh ko‘rinadi', () => {
    renderApp(<GeneralTab patient={patientDetail} />);
    expect(screen.getByLabelText('Telefon')).toBeDisabled();
    expect(screen.getByLabelText('Passport')).toBeDisabled();
    expect(screen.getByLabelText('Manzil')).toBeDisabled();
    expect(screen.getByTestId('pii-readonly-hint')).toBeInTheDocument();
  });

  it('view_pii siz: maskalangan qiymat validatsiyani bloklamaydi va PATCH ga YUBORILMAYDI', () => {
    renderApp(<GeneralTab patient={patientDetail} />);
    fireEvent.change(screen.getByLabelText("To'liq ism"), { target: { value: 'Ali Yangi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(updateMutate).toHaveBeenCalledTimes(1);
    const body = updateMutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.fullName).toBe('Ali Yangi');
    for (const k of ['phone', 'phoneSecondary', 'passport', 'address']) {
      expect(body[k]).toBeUndefined();
    }
    expect(JSON.stringify(body)).not.toContain('***');
  });

  it('view_pii bilan: o‘zgarmagan PII ham yuborilmaydi (faqat o‘zgargan maydonlar)', () => {
    canPii = true;
    rawResult = dataResult;
    renderApp(<GeneralTab patient={patientDetail} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    const body = updateMutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.phone).toBeUndefined();
    expect(body.passport).toBeUndefined();
  });
});

describe('GeneralTab — edit forma telefon validatsiyasi (L13 regression guard)', () => {
  beforeEach(() => {
    canEdit = true;
    rawResult = dataResult;
    updateMutate.mockClear();
  });

  it("noto'g'ri telefon kiritilib saqlansa xato ko'rinadi va submit bloklanadi", () => {
    renderApp(<GeneralTab patient={patientDetail} />);
    // PhoneInput faqat raqamlarni qabul qiladi — 2 ta raqam (5 xonali +998 bilan) regex'ni buzadi.
    fireEvent.change(screen.getByLabelText('Telefon'), { target: { value: '12' } });
    fireEvent.click(screen.getByText('Saqlash'));
    const phoneInput = screen.getByLabelText('Telefon') as HTMLInputElement;
    expect(phoneInput).toHaveAttribute('aria-invalid', 'true');
    expect(updateMutate).not.toHaveBeenCalled();
  });
});
