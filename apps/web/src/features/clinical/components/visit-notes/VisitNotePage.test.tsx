import { ApiError } from '@dental/api-client';
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
let plans: Array<Record<string, unknown>> = [];
let medicalState: { isError: boolean; isLoading: boolean } = { isError: false, isLoading: false };
let rxError: unknown = null;

vi.mock('../../clinical.api', () => ({
  useVisitNote: () => ({ data: note, isLoading: false, isError: false, refetch: vi.fn() }),
  useVisitNotes: () => ({ data: notes }),
  useDiagnoses: () => ({ data: [] }),
  useServiceCatalog: () => ({ data: [] }),
  useTreatmentPlans: () => ({ data: plans }),
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
      return rxError ? Promise.reject(rxError) : Promise.resolve({});
    },
  }),
}));

vi.mock('@/features/patients/patients.api', () => ({
  usePatient: () => ({ data: { fullName: 'Jasur Tursunov' } }),
  useMedicalRecord: () => ({
    data: medicalState.isError ? undefined : { allergies },
    ...medicalState,
  }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    user: { id: 'doc-1', fullName: 'Dr. Yusupova' },
    activeBranchId: 'b1',
    hasPermission: () => true,
  }),
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
  options: [{ value: 'doc-1', label: 'Dr. Yusupova' }],
  canAuthor: true,
  showPicker: false,
  defaultDoctorId: 'doc-1',
  isLoading: false,
};
let author: Author = selfAuthor;
vi.mock('../../clinical-author', () => ({
  useClinicalAuthor: () => author,
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
    plans = [];
    medicalState = { isError: false, isLoading: false };
    rxError = null;
    author = selfAuthor;
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
    // FX-123: retsept faqat imzolashda yaratiladi, override sababi bilan.
    expect(rxMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Imzolash va kassaga/ }));
    await waitFor(() => expect(rxMutate).toHaveBeenCalledTimes(1));
    expect(rxMutate.mock.calls[0]?.[0]).toMatchObject({
      allergyOverrides: [{ drug: 'Amoksitsillin 500 mg', reason: 'patient_informed' }],
    });
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

  it('FX-14 review: bosqichga bog‘langan qoralamada «Rejasiz vizit» disabled; «Bosqich yakunlandi» tahrirlanadi', async () => {
    plans = [
      {
        id: 'plan-1',
        title: 'Reja',
        status: 'in_progress',
        stages: [
          {
            id: 's1',
            sequence: 1,
            serviceName: 'Plomba',
            status: 'in_progress',
            acceptance: 'accepted',
          },
          {
            id: 's2',
            sequence: 2,
            serviceName: 'Kanal',
            status: 'pending',
            acceptance: 'accepted',
          },
        ],
      },
    ];
    note = {
      id: 'n1',
      patientId: 'p1',
      subjective: 'Shikoyat',
      objective: null,
      plan: null,
      freeNotes: null,
      assessmentDiagnoses: [],
      performedServices: [],
      stageId: 's1',
      completesStage: true,
      appointmentId: null,
      visitDate: '2026-11-11T10:00:00Z',
      updatedAt: '2026-11-11T10:05:00Z',
      signedAt: null,
      metadata: null,
    };
    mount('/patients/p1/visits/n1/edit');
    expect(screen.getByRole('radio', { name: 'Rejasiz vizit' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Kanal/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Plomba/ })).toBeChecked();

    const completes = screen.getByRole('checkbox', { name: /Bosqich yakunlandi/ });
    expect(completes).toBeEnabled();
    fireEvent.click(completes);
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate.mock.calls[0]?.[0]).toMatchObject({
      id: 'n1',
      body: { stageId: 's1', completesStage: false },
    });
  });

  it('FX-14 review: eski lokal qoralama («Rejasiz») bog‘langan yozuv bosqichini ezmaydi', () => {
    plans = [
      {
        id: 'plan-1',
        title: 'Reja',
        status: 'in_progress',
        stages: [
          {
            id: 's1',
            sequence: 1,
            serviceName: 'Plomba',
            status: 'in_progress',
            acceptance: 'accepted',
          },
        ],
      },
    ];
    note = {
      id: 'n1',
      patientId: 'p1',
      subjective: 'Shikoyat',
      objective: null,
      plan: null,
      freeNotes: null,
      assessmentDiagnoses: [],
      performedServices: [],
      stageId: 's1',
      completesStage: true,
      appointmentId: null,
      visitDate: '2026-11-11T10:00:00Z',
      updatedAt: '2026-11-11T10:05:00Z',
      signedAt: null,
      metadata: null,
    };
    localStorage.setItem(
      'visit-note-draft:p1:n1',
      JSON.stringify({
        values: { subjective: 'lokal', stageId: null, completesStage: true },
        rx: [],
        overrides: [],
        savedAt: '2026-11-12T10:00:00Z',
      }),
    );
    mount('/patients/p1/visits/n1/edit');
    expect(screen.getByRole('radio', { name: /Plomba/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Rejasiz vizit' })).not.toBeChecked();
  });

  it('bog‘lanmagan qoralamada «Rejasiz vizit» tanlanadi', () => {
    mount();
    expect(screen.getByRole('radio', { name: 'Rejasiz vizit' })).toBeEnabled();
  });

  const fillRx = () => {
    addDrug('Ibuprofen');
    fireEvent.change(screen.getByLabelText('Doza'), { target: { value: '200 mg' } });
    fireEvent.change(screen.getByLabelText('Qanday'), { target: { value: '1×2' } });
    fireEvent.change(screen.getByLabelText('Shikoyat'), { target: { value: 'og‘riq' } });
  };

  it('FX-22: allergiya noma‘lum (xato/403) + retsept → kritik oyna, saqlanmaydi; sabab bilan tasdiqlangach audit izi bilan saqlanadi', async () => {
    medicalState = { isError: true, isLoading: false };
    mount();
    fillRx();
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(await screen.findByText('Allergiya ma’lumoti noma’lum')).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
    expect(rxMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: 'Allergiya og‘zaki so‘rab tekshirildi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Baribir davom etish' }));
    await waitFor(() => expect(screen.queryByText('Allergiya ma’lumoti noma’lum')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0]?.[0]).toMatchObject({
      allergyOverrides: [
        { drug: 'Ibuprofen', group: 'unknown', reason: 'allergy_checked_verbally' },
      ],
    });
    // FX-123: «Saqlash» retsept yaratmaydi — faqat imzolashda.
    expect(rxMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Imzolash va kassaga/ }));
    await waitFor(() => expect(rxMutate).toHaveBeenCalledTimes(1));
  });

  it('FX-22: allergiya yuklanayotganda ham retsept bilan saqlash tasdiqsiz o‘tmaydi', async () => {
    medicalState = { isError: false, isLoading: true };
    mount();
    fillRx();
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(await screen.findByText('Allergiya ma’lumoti noma’lum')).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('FX-22: retseptsiz vizit — allergiya noma‘lum bo‘lsa ham oyna chiqmaydi', async () => {
    medicalState = { isError: true, isLoading: false };
    mount();
    fireEvent.change(screen.getByLabelText('Shikoyat'), { target: { value: 'og‘riq' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Allergiya ma’lumoti noma’lum')).toBeNull();
  });

  it('FX-22: server 409 prescription.allergy_conflict → kritik oyna (mijoz ma‘lumoti bo‘lmasa ham)', async () => {
    allergies = null;
    rxError = new ApiError('prescription.allergy_conflict', 'conflict', 409, [
      { drug: 'Ibuprofen', group: 'nsaid', allergen: 'Aspirin' },
    ]);
    mount();
    fillRx();
    fireEvent.click(screen.getByRole('button', { name: /Imzolash va kassaga/ }));
    expect(await screen.findByText('Allergiya ogohlantirishi')).toBeInTheDocument();
    expect(signMutate).not.toHaveBeenCalled();
  });

  it('FX-123: «Saqlash» retsept yaratmaydi — qatorlar formada va qoralamada qoladi; imzoda retsept imzodan OLDIN yaratiladi', async () => {
    allergies = null;
    mount();
    fillRx();
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(rxMutate).not.toHaveBeenCalled();
    expect(signMutate).not.toHaveBeenCalled();
    expect(localStorage.getItem('visit-note-draft:p1:n-new')).toContain('Ibuprofen');

    fireEvent.click(screen.getByRole('button', { name: /Imzolash va kassaga/ }));
    await waitFor(() => expect(signMutate).toHaveBeenCalledTimes(1));
    expect(rxMutate).toHaveBeenCalledTimes(1);
    expect(rxMutate.mock.invocationCallOrder[0]).toBeLessThan(
      signMutate.mock.invocationCallOrder[0] ?? 0,
    );
  });
});

describe('VisitNotePage — FX-155 muallif (rol bo‘yicha)', () => {
  const onBehalf: Author = {
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

  beforeEach(() => {
    localStorage.clear();
    for (const m of [createMutate, updateMutate, signMutate, rxMutate]) m.mockClear();
    note = undefined;
    notes = [];
    allergies = null;
    plans = [];
    medicalState = { isError: false, isLoading: false };
    rxError = null;
    author = selfAuthor;
  });

  it('shifokor emas va on_behalf yo‘q (Branch Manager) — yangi vizit o‘rniga tushuntirish, saqlash yo‘q', () => {
    author = {
      ...selfAuthor,
      canSelf: false,
      options: [],
      canAuthor: false,
      defaultDoctorId: null,
    };
    mount();
    expect(screen.getByText('Vizit yozuvini faqat shifokor yaratadi')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Saqlash' })).toBeNull();
  });

  it('o‘z nomidan shifokor — doctorId = o‘zi', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Shikoyat'), { target: { value: 'og‘riq' } });
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0]?.[0]).toMatchObject({ doctorId: 'doc-1' });
  });

  it('on_behalf (Tenant Admin) — shifokor tanlanmaguncha saqlanmaydi; tanlangan shifokor vizit va retsept muallifi', async () => {
    author = onBehalf;
    mount();
    fireEvent.change(screen.getByLabelText('Shikoyat'), { target: { value: 'og‘riq' } });
    expect(screen.getByRole('button', { name: 'Saqlash' })).toBeDisabled();
    fireEvent.click(screen.getByRole('textbox', { name: 'Shifokor' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Doc B' }));
    addDrug('Paratsetamol');
    fireEvent.change(screen.getByLabelText('Doza'), { target: { value: '500 mg' } });
    fireEvent.change(screen.getByLabelText('Qanday'), { target: { value: '1×3' } });
    fireEvent.click(screen.getByRole('button', { name: /Imzolash va kassaga/ }));
    await waitFor(() => expect(rxMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0]?.[0]).toMatchObject({ doctorId: 'doc-b' });
    expect(rxMutate.mock.calls[0]?.[0]).toMatchObject({ doctorId: 'doc-b' });
  });

  it('mavjud yozuvni on_behalf bilan imzolash — retsept muallifi yozuv shifokori', async () => {
    author = onBehalf;
    note = {
      id: 'n1',
      patientId: 'p1',
      doctorId: 'doc-x',
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
      signedAt: null,
      metadata: null,
    };
    mount('/patients/p1/visits/n1/edit');
    expect(screen.queryByRole('textbox', { name: 'Shifokor' })).toBeNull();
    addDrug('Paratsetamol');
    fireEvent.change(screen.getByLabelText('Doza'), { target: { value: '500 mg' } });
    fireEvent.change(screen.getByLabelText('Qanday'), { target: { value: '1×3' } });
    fireEvent.click(screen.getByRole('button', { name: /Imzolash va kassaga/ }));
    await waitFor(() => expect(rxMutate).toHaveBeenCalledTimes(1));
    expect(rxMutate.mock.calls[0]?.[0]).toMatchObject({ doctorId: 'doc-x' });
  });
});
