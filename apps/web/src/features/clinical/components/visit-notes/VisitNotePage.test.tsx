import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { VisitNotePage } from './VisitNotePage';

const createMutate = vi.fn();
const updateMutate = vi.fn();
const signMutate = vi.fn();
const rxMutate = vi.fn();
let note: Record<string, unknown> | undefined;
let notes: Array<Record<string, unknown>> = [];
let allergies: Array<{ substance: string }> | null = [{ substance: 'Penitsillin' }];

vi.mock('../../clinical.api', () => ({
  useVisitNote: () => ({ data: note, isLoading: false, isError: false, refetch: vi.fn() }),
  useVisitNotes: () => ({ data: notes }),
  useDiagnoses: () => ({ data: [] }),
  useServiceCatalog: () => ({ data: [] }),
  useTreatmentPlans: () => ({ data: [] }),
  usePatientAppointments: () => ({ data: [] }),
  useVisitNoteTemplates: () => ({ data: [] }),
  usePrescriptions: () => ({ data: [] }),
  useServicePrices: () => new Map(),
  useCreateVisitNote: () => ({
    isPending: false,
    mutateAsync: (b: unknown) => {
      createMutate(b);
      return Promise.resolve({ id: 'n-new' });
    },
  }),
  useUpdateVisitNote: () => ({
    isPending: false,
    mutateAsync: (b: unknown) => {
      updateMutate(b);
      return Promise.resolve({});
    },
  }),
  useSignVisitNote: () => ({
    isPending: false,
    mutateAsync: (id: string) => {
      signMutate(id);
      return Promise.resolve({});
    },
  }),
  useCreatePrescription: () => ({
    isPending: false,
    mutateAsync: (b: unknown) => {
      rxMutate(b);
      return Promise.resolve({});
    },
  }),
}));

vi.mock('@/features/patients/patients.api', () => ({
  usePatient: () => ({ data: { fullName: 'Jasur Tursunov' } }),
  useMedicalRecord: () => ({ data: { allergies }, isError: false }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    user: { id: 'doc-1', fullName: 'Dr. Yusupova' },
    activeBranchId: 'b1',
    hasPermission: () => true,
  }),
}));

const mount = (route = '/patients/p1/visits/new') =>
  renderApp(
    <Routes>
      <Route path="/patients/:id/visits/new" element={<VisitNotePage />} />
      <Route path="/patients/:id/visits/:visitId/edit" element={<VisitNotePage />} />
    </Routes>,
    { route },
  );

const addDrug = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: /\+ Dori/ }));
  const drug = screen.getByLabelText('Dori');
  fireEvent.change(drug, { target: { value: name } });
  fireEvent.blur(drug);
};

describe('VisitNotePage — dori ↔ allergiya (UI-D4)', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const m of [createMutate, updateMutate, signMutate, rxMutate]) m.mockClear();
    note = undefined;
    notes = [];
    allergies = [{ substance: 'Penitsillin' }];
  });

  it('penitsillin allergiyali bemorga amoksitsillin → kritik oyna; sabab tanlanmaguncha davom etib bo‘lmaydi', () => {
    mount();
    addDrug('Amoksitsillin 500 mg');
    expect(screen.getByText('Allergiya ogohlantirishi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baribir davom etish' })).toBeDisabled();
  });

  it('sabab bilan tasdiqlansa saqlanadi (metadata) va shu bemorda qayta so‘ralmaydi', async () => {
    mount();
    addDrug('Amoksitsillin 500 mg');
    fireEvent.click(screen.getByRole('radio', { name: 'Bemor xabardor, rozi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Baribir davom etish' }));
    await waitFor(() => expect(screen.queryByText('Allergiya ogohlantirishi')).toBeNull());

    // Shu dori yana blur bo'lsa — qayta so'ralmaydi.
    fireEvent.blur(screen.getByLabelText('Dori'));
    expect(screen.queryByText('Allergiya ogohlantirishi')).toBeNull();

    fireEvent.change(screen.getByLabelText('Shikoyat'), { target: { value: 'og‘riq' } });
    fireEvent.change(screen.getByLabelText('Doza'), { target: { value: '500 mg' } });
    fireEvent.change(screen.getByLabelText('Qanday'), { target: { value: '1×3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0]?.[0]).toMatchObject({
      allergyOverrides: [
        {
          drug: 'Amoksitsillin 500 mg',
          group: 'penicillin',
          allergen: 'Penitsillin',
          reason: 'patient_informed',
        },
      ],
    });
    await waitFor(() => expect(rxMutate).toHaveBeenCalledTimes(1));
  });

  it('oldingi vizitda tasdiqlangan override — yangi vizitda ham so‘ralmaydi', () => {
    notes = [
      {
        id: 'old',
        metadata: {
          allergyOverrides: [
            { drug: 'Amoksitsillin', group: 'penicillin', allergen: 'Penitsillin', reason: 'x' },
          ],
        },
      },
    ];
    mount();
    addDrug('Amoksitsillin 500 mg');
    expect(screen.queryByText('Allergiya ogohlantirishi')).toBeNull();
  });

  it('«Dorini almashtiraman» — dori maydoni tozalanadi, override saqlanmaydi', () => {
    mount();
    addDrug('Ampitsillin');
    fireEvent.click(screen.getByRole('button', { name: 'Dorini almashtiraman' }));
    expect(screen.queryByText('Allergiya ogohlantirishi')).toBeNull();
    expect((screen.getByLabelText('Dori') as HTMLInputElement).value).toBe('');
  });

  it('allergiyasiz bemorda oyna chiqmaydi', () => {
    allergies = null;
    mount();
    addDrug('Amoksitsillin');
    expect(screen.queryByText('Allergiya ogohlantirishi')).toBeNull();
  });

  it('imzolangan yozuv: faqat ko‘rish — saqlash/imzolash tugmalari yo‘q, maydonlar disabled', () => {
    note = {
      id: 'n1',
      patientId: 'p1',
      subjective: 'Shikoyat',
      objective: null,
      plan: null,
      freeNotes: null,
      assessmentDiagnoses: [],
      performedServices: [],
      stageId: null,
      appointmentId: null,
      visitDate: '2026-11-11T10:00:00Z',
      updatedAt: '2026-11-11T10:05:00Z',
      signedAt: '2026-11-11T10:05:00Z',
      metadata: null,
    };
    mount('/patients/p1/visits/n1/edit');
    expect(screen.getByText('Imzolangan — endi o‘zgartirib bo‘lmaydi')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Saqlash' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Imzolash va kassaga/ })).toBeNull();
    expect(screen.getByLabelText('Shikoyat')).toBeDisabled();
  });

  it('«Imzolash va kassaga yuborish»: avval saqlaydi, keyin imzolaydi', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Shikoyat'), { target: { value: 'og‘riq' } });
    fireEvent.click(screen.getByRole('button', { name: /Imzolash va kassaga/ }));
    await waitFor(() => expect(signMutate).toHaveBeenCalledWith('n-new'));
    expect(createMutate).toHaveBeenCalledTimes(1);
  });

  it('avto-qoralama localStorage’ga yoziladi', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Shikoyat'), { target: { value: 'qoralama matni' } });
    await waitFor(() =>
      expect(localStorage.getItem('visit-note-draft:p1:new')).toContain('qoralama matni'),
    );
  });
});
