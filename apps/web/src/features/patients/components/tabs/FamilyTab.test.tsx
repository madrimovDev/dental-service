import type { PatientEmergencyContact, PatientRelativeView } from '@dental/api-client';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { FamilyTab } from './FamilyTab';

const addMutate = vi.fn();
const removeMutate = vi.fn();
const addEcMutate = vi.fn();
const removeEcMutate = vi.fn();
const relativesRefetch = vi.fn();
const emergencyRefetch = vi.fn();
let relatives: PatientRelativeView[] = [];
let emergencyContacts: PatientEmergencyContact[] = [];
let relativesIsError = false;
let emergencyIsError = false;

vi.mock('../../patients.api', () => ({
  usePatientRelatives: () => ({
    data: relatives,
    isLoading: false,
    isError: relativesIsError,
    refetch: relativesRefetch,
  }),
  useAddRelative: () => ({ mutate: addMutate, isPending: false }),
  useRemoveRelative: () => ({ mutate: removeMutate, isPending: false }),
  usePatientEmergencyContacts: () => ({
    data: emergencyContacts,
    isLoading: false,
    isError: emergencyIsError,
    refetch: emergencyRefetch,
  }),
  useAddEmergencyContact: () => ({ mutate: addEcMutate, isPending: false }),
  useRemoveEmergencyContact: () => ({ mutate: removeEcMutate, isPending: false }),
  usePatients: () => ({
    data: {
      items: [
        { id: 'p2', fullName: 'Vali Aliyev' },
        { id: 'p1', fullName: 'Joriy Bemor' },
      ],
    },
  }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

describe('FamilyTab', () => {
  beforeEach(() => {
    addMutate.mockClear();
    removeMutate.mockClear();
    addEcMutate.mockClear();
    removeEcMutate.mockClear();
    relativesRefetch.mockClear();
    emergencyRefetch.mockClear();
    relatives = [];
    emergencyContacts = [];
    relativesIsError = false;
    emergencyIsError = false;
  });

  it("qarindoshlar yo'q bo'lsa bo'sh holatni ko'rsatadi", () => {
    renderApp(<FamilyTab patientId="p1" />);
    expect(screen.getByText("Qarindoshlar qo'shilmagan")).toBeInTheDocument();
  });

  it("qarindoshlar ro'yxatini ism + munosabat bilan ko'rsatadi", () => {
    relatives = [
      {
        id: 'link1',
        relativePatient: { id: 'p2', fullName: 'Vali Aliyev' },
        relationship: 'aka',
        direction: 'outgoing',
      },
    ];
    renderApp(<FamilyTab patientId="p1" />);
    const row = screen.getByText('aka').closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('Vali Aliyev');
    expect(row).toHaveTextContent('aka');
  });

  it('bemor tanlanmagan submit zod4Resolver tomonidan bloklanadi', () => {
    renderApp(<FamilyTab patientId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: "Qarindosh qo'shish" }));
    expect(addMutate).not.toHaveBeenCalled();
  });

  it("o'chirish tugmasi remove mutatsiyasini link id bilan chaqiradi", () => {
    relatives = [
      {
        id: 'link1',
        relativePatient: { id: 'p2', fullName: 'Vali Aliyev' },
        relationship: 'aka',
        direction: 'incoming',
      },
    ];
    renderApp(<FamilyTab patientId="p1" />);
    fireEvent.click(screen.getByLabelText("O'chirish"));
    expect(removeMutate).toHaveBeenCalledWith('link1');
  });

  it("favqulodda kontaktlar yo'q bo'lsa bo'sh holatni ko'rsatadi", () => {
    renderApp(<FamilyTab patientId="p1" />);
    expect(screen.getByText("Favqulodda kontaktlar qo'shilmagan")).toBeInTheDocument();
  });

  it('favqulodda kontaktni ism + telefon + asosiy belgi bilan ko‘rsatadi', () => {
    emergencyContacts = [
      {
        id: 'ec1',
        tenantId: 't1',
        patientId: 'p1',
        name: 'Lola Karimova',
        phone: '+998901112233',
        relationship: 'opa',
        isPrimary: true,
        createdAt: '2026-06-22T00:00:00.000Z',
      },
    ];
    renderApp(<FamilyTab patientId="p1" />);
    const row = screen.getByText('Lola Karimova').closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('+998901112233');
    expect(row).toHaveTextContent('Asosiy');
  });

  // CLI-467: avval xato ham "bo'sh" (ro'yxat = []) sifatida ko'rsatilardi — endi
  // alohida error StateView + retry (refetch chaqiradi).
  it("qarindoshlar so'rovi xato bo'lsa error StateView ko'rsatadi va retry refetch chaqiradi", () => {
    relativesIsError = true;
    renderApp(<FamilyTab patientId="p1" />);
    expect(screen.queryByText("Qarindoshlar qo'shilmagan")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Qayta urinish'));
    expect(relativesRefetch).toHaveBeenCalled();
  });

  it("favqulodda kontaktlar so'rovi xato bo'lsa error StateView ko'rsatadi va retry refetch chaqiradi", () => {
    emergencyIsError = true;
    renderApp(<FamilyTab patientId="p1" />);
    expect(screen.queryByText("Favqulodda kontaktlar qo'shilmagan")).not.toBeInTheDocument();
    // Ikkita "Qayta urinish" tugmasi bo'lishi mumkin emas (relatives xato emas) — bittasi.
    fireEvent.click(screen.getByText('Qayta urinish'));
    expect(emergencyRefetch).toHaveBeenCalled();
  });
});
