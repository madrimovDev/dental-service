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

vi.mock('../../patients.api', () => ({
  useMedicalRecord: () => medicalResult,
  useMedicalRecordHistory: () => ({ data: [] }),
  useUpdateMedicalRecord: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    hasPermission: (code: string) => (code === 'medical_record.view' ? canView : false),
  }),
}));

describe('MedicalTab', () => {
  beforeEach(() => {
    medicalResult = dataResult;
    canView = true;
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
