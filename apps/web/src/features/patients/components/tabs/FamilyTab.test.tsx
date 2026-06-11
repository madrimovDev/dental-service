import type { PatientRelativeView } from '@dental/api-client';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { FamilyTab } from './FamilyTab';

const addMutate = vi.fn();
const removeMutate = vi.fn();
let relatives: PatientRelativeView[] = [];

vi.mock('../../patients.api', () => ({
  usePatientRelatives: () => ({ data: relatives, isLoading: false }),
  useAddRelative: () => ({ mutate: addMutate, isPending: false }),
  useRemoveRelative: () => ({ mutate: removeMutate, isPending: false }),
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
    relatives = [];
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
});
