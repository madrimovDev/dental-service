import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { MedicalTab } from './MedicalTab';

const refetchMock = vi.fn();
const dataResult = {
  data: {
    anamnez: 'Sog’lom',
    chronicConditions: [],
    currentMedications: [],
    allergies: [],
    bloodType: 'O+',
    pregnancyStatus: 'not_applicable',
  },
  isLoading: false,
  isError: false,
  refetch: refetchMock,
};
// biome-ignore lint/suspicious/noExplicitAny: test-only mutable mock result
let medicalResult: any = dataResult;
let canView = true;
let canEditOverride = false;

vi.mock('../../patients.api', () => ({
  useMedicalRecord: () => medicalResult,
  useMedicalRecordHistory: () => ({ data: [] }),
  useUpdateMedicalRecord: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    hasPermission: (code: string) =>
      code === 'medical_record.view' ? canView : code === 'medical_record.edit' && canEditOverride,
  }),
}));

describe('MedicalTab', () => {
  beforeEach(() => {
    medicalResult = dataResult;
    canView = true;
    canEditOverride = false;
    refetchMock.mockClear();
  });

  it("medical_record.view ruxsati bo'lmasa ruxsat xabari ko'rsatadi", () => {
    canView = false;
    renderApp(<MedicalTab patientId="p1" />);
    expect(screen.getByText("Sizda tibbiy kartani ko'rish ruxsati yo'q")).toBeInTheDocument();
  });

  it('isLoading holatida loading skeleton ko‘rsatadi', () => {
    medicalResult = { data: undefined, isLoading: true, isError: false, refetch: refetchMock };
    renderApp(<MedicalTab patientId="p1" />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  // CLI-467: avval xato holati ham cheksiz "loading" matni bilan ko'rsatilardi.
  it('isError holatida error StateView ko‘rsatadi va retry refetch chaqiradi', () => {
    medicalResult = { data: undefined, isLoading: false, isError: true, refetch: refetchMock };
    renderApp(<MedicalTab patientId="p1" />);
    expect(document.querySelector('[data-state="error"]')).not.toBeNull();
    fireEvent.click(screen.getByText('Qayta urinish'));
    expect(refetchMock).toHaveBeenCalled();
  });

  it("ma'lumot yuklangach formani render qiladi", () => {
    renderApp(<MedicalTab patientId="p1" />);
    expect(screen.getByText('Anamnez (umumiy salomatlik tarixi)')).toBeInTheDocument();
  });
});

describe('MedicalTab — FX-28 bot anketasi', () => {
  beforeEach(() => {
    canView = true;
  });

  it('anketa qoralamasi ko‘rinadi va «tibbiy kartaga ko‘chirish» formani to‘ldiradi', () => {
    medicalResult = {
      ...dataResult,
      data: {
        ...dataResult.data,
        questionnaireAnswers: { allergies: 'penitsillin', chronic: 'diabet' },
        questionnaireAt: '2026-11-18T10:00:00.000Z',
      },
    };
    canEditOverride = true;
    renderApp(<MedicalTab patientId="p1" />);
    expect(screen.getByText('Bemor anketasi (qoralama)')).toBeInTheDocument();
    expect(screen.getByText('penitsillin')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Tibbiy kartaga ko‘chirish'));
    expect(screen.getByDisplayValue('diabet')).toBeInTheDocument();
    expect(screen.getByDisplayValue('penitsillin')).toBeInTheDocument();
  });

  it('anketa bo‘lmasa blok ko‘rinmaydi', () => {
    medicalResult = dataResult;
    renderApp(<MedicalTab patientId="p1" />);
    expect(screen.queryByText('Bemor anketasi (qoralama)')).toBeNull();
  });
});
