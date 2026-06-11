import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { PrescriptionsTab } from './PrescriptionsTab';

const mutate = vi.fn();
vi.mock('../../clinical.api', () => ({
  usePrescriptions: () => ({ data: [], isLoading: false }),
  useCreatePrescription: () => ({ mutate, isPending: false }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ user: { id: 'u1' }, hasPermission: () => true }),
}));

describe('PrescriptionsTab', () => {
  it("dori qo'shib saqlash → createPrescription chaqiradi", async () => {
    renderApp(<PrescriptionsTab patientId="p1" />);
    // open modal — prescription.create = "Yangi resept"
    fireEvent.click(screen.getByText('Yangi resept'));
    // add item — prescription.add_item = "Dori qo'shish" (modal portal — async)
    fireEvent.click(await screen.findByText("Dori qo'shish"));
    // medication name — prescription.medication_name = "Dori nomi"
    fireEvent.change(await screen.findByLabelText('Dori nomi'), {
      target: { value: 'Amoxicillin' },
    });
    // dosage — prescription.dosage = "Dozasi"
    fireEvent.change(screen.getByLabelText('Dozasi'), { target: { value: '500mg' } });
    // save — prescription.save = "Reseptni saqlash"
    fireEvent.click(screen.getByText('Reseptni saqlash'));
    expect(mutate).toHaveBeenCalled();
  });
});
