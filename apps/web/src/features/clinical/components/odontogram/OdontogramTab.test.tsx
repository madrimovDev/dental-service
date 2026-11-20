import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { OdontogramTab } from './OdontogramTab';

const mutate = vi.fn();
// biome-ignore lint/suspicious/noExplicitAny: test mock chart fixture
let mockChart: any = null;
// biome-ignore lint/suspicious/noExplicitAny: test mock history fixture
let mockHistory: any[] = [];
// biome-ignore lint/suspicious/noExplicitAny: test mock plans fixture
let mockPlans: any[] = [];
let mockPermissions = true;

const DX = [
  { id: 'dx-1', code: 'K02.1', nameUz: 'Dentin kariyesi', nameRu: 'Кариес дентина' },
  { id: 'dx-2', code: 'K04.0', nameUz: 'Pulpit', nameRu: 'Пульпит' },
];
const SERVICES = [
  {
    id: 'sv-1',
    code: 'PL',
    nameUz: 'Plomba (kompozit)',
    nameRu: null,
    category: null,
    descriptionUz: null,
    isActive: true,
  },
  {
    id: 'sv-2',
    code: 'IK',
    nameUz: 'Ildiz kanalini davolash',
    nameRu: null,
    category: null,
    descriptionUz: null,
    isActive: true,
  },
];
const createPlanMutate = vi.fn();
const addStagesMutate = vi.fn();
const searches: Array<string | undefined> = [];

vi.mock('../../clinical.api', () => ({
  useLatestToothChart: () => ({ data: mockChart, isLoading: false }),
  useToothChartHistory: () => ({ data: mockHistory }),
  useDiagnoses: (search?: string) => {
    searches.push(search);
    return { data: DX };
  },
  useCreateToothChart: () => ({ mutate, isPending: false }),
  useTreatmentPlans: () => ({ data: mockPlans }),
  useCreatePlan: () => ({ mutate: createPlanMutate, isPending: false }),
  useAddPlanStages: () => ({ mutate: addStagesMutate, isPending: false }),
  useServiceCatalog: () => ({ data: SERVICES }),
  usePatientToothImages: () => ({ data: [], isLoading: false, isError: false }),
  useVisitNotes: () => ({ data: [], isLoading: false }),
  useUploadPatientImage: () => ({ mutate: vi.fn(), isPending: false }),
  fetchServicePrices: async (_qc: unknown, id: string) => ({
    id,
    prices: [
      {
        branchId: 'b1',
        validFrom: '2026-01-01',
        validTo: null,
        price: id === 'sv-2' ? '1800000.00' : '450000.00',
      },
    ],
  }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => {
    const state = {
      hasPermission: () => mockPermissions,
      user: { id: 'u1' },
      activeBranchId: 'b1',
    };
    return sel ? sel(state) : state;
  },
}));

const search = (q: string) =>
  fireEvent.change(
    screen.getByLabelText(/Tashxis nomi yoki kodi|Tashxis qo'shish/i, { selector: 'input' }),
    {
      target: { value: q },
    },
  );

const saveSnapshot = () => screen.getByRole('button', { name: /Snapshot saqlash/i });

describe('OdontogramTab', () => {
  beforeEach(() => {
    mutate.mockClear();
    createPlanMutate.mockClear();
    addStagesMutate.mockClear();
    searches.length = 0;
    mockChart = null;
    mockHistory = [];
    mockPlans = [];
    mockPermissions = true;
    window.localStorage.clear();
  });

  it("bo'sh chart + tish tanlash Save ni yoqmaydi (CLI-105 empty-save erase)", () => {
    renderApp(<OdontogramTab patientId="p1" />);
    fireEvent.click(screen.getByText('11'));
    expect(saveSnapshot()).toBeDisabled();
  });

  it('mavjud chart yuklanganda Save states bilan yuboradi', () => {
    mockChart = {
      isPrimaryDentition: false,
      states: [{ toothNumber: 11, surface: 'whole', state: 'caries' }],
    };
    renderApp(<OdontogramTab patientId="p1" />);
    fireEvent.click(saveSnapshot());
    const arg = mutate.mock.calls[0]?.[0];
    expect(arg).toMatchObject({ patientId: 'p1', isPrimaryDentition: false });
    expect(arg.states.length).toBe(1);
  });

  it("FX-122: «Sut tishlar» switch'i draft'ni tozalamaydi — doimiy tish holati saqlanadi", () => {
    mockChart = {
      isPrimaryDentition: false,
      states: [{ toothNumber: 16, surface: 'whole', state: 'caries' }],
    };
    renderApp(<OdontogramTab patientId="p1" />);
    fireEvent.click(screen.getByRole('switch', { name: /Sut tishlar|Молочные/i }));
    expect(saveSnapshot()).toBeEnabled();
    fireEvent.click(saveSnapshot());
    const arg = mutate.mock.calls[0]?.[0];
    expect(arg.isPrimaryDentition).toBe(true);
    expect(arg.states).toContainEqual(
      expect.objectContaining({ toothNumber: 16, state: 'caries' }),
    );
  });

  it('CLI-189: saqlangan non-whole surface + diagnosisId round-trip yuboriladi', () => {
    mockChart = {
      isPrimaryDentition: false,
      states: [{ toothNumber: 16, surface: 'O', state: 'filling', diagnosisId: 'dx-1' }],
    };
    renderApp(<OdontogramTab patientId="p1" />);
    fireEvent.click(saveSnapshot());
    expect(mutate.mock.calls[0]?.[0].states).toContainEqual({
      toothNumber: 16,
      state: 'filling',
      surface: 'O',
      diagnosisId: 'dx-1',
    });
  });

  it('UI-D3: bitta tishga ikki tashxis qo‘shiladi, ikkalasi payload’da (round-trip)', async () => {
    renderApp(<OdontogramTab patientId="p1" />);
    fireEvent.click(screen.getByText('36'));

    fireEvent.click(screen.getByRole('button', { name: /Okklyuzion \(O\)/i }));
    search('karies');
    fireEvent.click(await screen.findByRole('option', { name: /Dentin kariyesi/ }));
    fireEvent.click(screen.getByRole('button', { name: "Tashxis qo'shish" }));

    search('pulpit');
    fireEvent.click(await screen.findByRole('option', { name: /Pulpit/ }));
    fireEvent.click(screen.getByRole('button', { name: "Tashxis qo'shish" }));

    // ikkita chip: «shu tishdagi tashxislar»
    expect(screen.getAllByTestId('tooth-dx-chip')).toHaveLength(2);

    fireEvent.click(saveSnapshot());
    const states = mutate.mock.calls[0]?.[0].states;
    expect(states).toContainEqual({
      toothNumber: 36,
      state: 'caries', // K02 → taklif qilingan holat
      surface: 'O',
      diagnosisId: 'dx-1',
    });
    expect(states).toContainEqual({
      toothNumber: 36,
      state: 'caries', // K04 → kariyes (taklif)
      surface: 'whole',
      diagnosisId: 'dx-2',
    });
  });

  it('UI-D3: tashxis chipini olib tashlash payload’dan ham olib tashlaydi', () => {
    mockChart = {
      isPrimaryDentition: false,
      states: [
        { toothNumber: 36, surface: 'O', state: 'caries', diagnosisId: 'dx-1' },
        { toothNumber: 36, surface: 'whole', state: 'caries', diagnosisId: 'dx-2' },
      ],
    };
    renderApp(<OdontogramTab patientId="p1" />);
    fireEvent.click(screen.getByText('36'));
    fireEvent.click(screen.getByRole('button', { name: /Pulpit — olib tashlash/ }));
    fireEvent.click(saveSnapshot());
    const states = mutate.mock.calls[0]?.[0].states;
    expect(states).toHaveLength(1);
    expect(states[0].diagnosisId).toBe('dx-1');
  });

  it('UI-D3: «Faqat tashxisni saqlash» tanlovni qo‘shib darhol saqlaydi', async () => {
    renderApp(<OdontogramTab patientId="p1" />);
    fireEvent.click(screen.getByText('16'));
    fireEvent.click(screen.getByRole('button', { name: /Distal \(D\)/i }));
    search('karies');
    fireEvent.click(await screen.findByRole('option', { name: /Dentin kariyesi/ }));
    fireEvent.click(screen.getByRole('button', { name: /Faqat tashxisni saqlash/ }));
    expect(mutate.mock.calls[0]?.[0].states).toContainEqual({
      toothNumber: 16,
      state: 'caries',
      surface: 'D',
      diagnosisId: 'dx-1',
    });
  });

  it('UI-D3: kreslo yoni rejimi localStorage’da saqlanadi va bosish zonasini kattalashtiradi', () => {
    renderApp(<OdontogramTab patientId="p1" />);
    fireEvent.click(screen.getByRole('switch', { name: /Kreslo yoni rejimi/i }));
    expect(window.localStorage.getItem('dental.odontogram.chairMode')).toBe('1');
    expect(document.querySelector('[data-chair]')).toBeTruthy();
  });

  it('UI-D3: «Reja» ko‘rinishi rejadagi tishlarni «rejada» deb belgilaydi', () => {
    mockPlans = [{ status: 'accepted', stages: [{ status: 'pending', toothNumbers: [16] }] }];
    renderApp(<OdontogramTab patientId="p1" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Reja' }));
    expect(screen.getAllByText('rejada').length).toBeGreaterThan(0);
  });

  it('UI-D3: ruxsatsiz (faqat ko‘rish) rolda tahrirlash boshqaruvlari yo‘q', () => {
    mockPermissions = false;
    renderApp(<OdontogramTab patientId="p1" />);
    fireEvent.click(screen.getByText('11'));
    expect(screen.queryByRole('button', { name: "Tashxis qo'shish" })).toBeNull();
    expect(screen.queryByRole('button', { name: /Snapshot saqlash/i })).toBeNull();
  });

  it('CLI-191: eski snapshot tanlanganda read-only (Save paneli yo‘q)', () => {
    mockChart = {
      isPrimaryDentition: false,
      states: [{ toothNumber: 11, surface: 'whole', state: 'caries', diagnosisId: null }],
    };
    mockHistory = [
      {
        id: 'snap-old',
        isPrimaryDentition: false,
        notes: null,
        createdAt: '2026-01-01T10:00:00.000Z',
        states: [{ toothNumber: 21, surface: 'M', state: 'crown', diagnosisId: null }],
      },
    ];
    renderApp(<OdontogramTab patientId="p1" />);
    expect(screen.queryByRole('button', { name: /Snapshot saqlash/i })).toBeTruthy();
    // «Tarix» ko'rinishiga o'tib eski snapshot tanlanadi
    fireEvent.click(screen.getByRole('radio', { name: 'Tarix' }));
    const historySelect = screen.getByPlaceholderText(/Tarix|истори/i);
    fireEvent.click(historySelect);
    fireEvent.click(screen.getByRole('option'));
    expect(screen.getAllByText(/qaytish|вернуться/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Snapshot saqlash/i })).toBeNull();
  });

  it("Davolash taklifi: tashxis tanlansa mos xizmat + filial narxi ko'rinadi; rejaga serviceId va narx bilan tushadi", async () => {
    mockChart = { isPrimaryDentition: false, states: [] };
    mutate.mockImplementation((_body: unknown, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    renderApp(<OdontogramTab patientId="p1" />);
    fireEvent.click(screen.getByText('36'));
    search('pulpit');
    fireEvent.click(await screen.findByText('Pulpit'));
    const radio = await screen.findByRole('radio', { name: /Ildiz kanalini davolash/ });
    expect(radio).toHaveTextContent('1 800 000');
    fireEvent.click(radio);
    expect(radio).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Rejaga qo'shish/i }));
    expect(createPlanMutate).toHaveBeenCalled();
    expect(createPlanMutate.mock.calls[0]?.[0].stages[0]).toMatchObject({
      serviceId: 'sv-2',
      serviceName: 'Ildiz kanalini davolash',
      cost: 1800000,
      toothNumbers: [36],
    });
  });

  describe('FT-01.3: tish → xizmat → joriy/yangi reja', () => {
    const PULPIT_CHART = {
      isPrimaryDentition: false,
      states: [{ toothNumber: 36, surface: 'whole', state: 'caries', diagnosisId: 'dx-2' }],
    };
    const PLANS = [
      {
        id: 'pl-done',
        title: 'Eski reja',
        status: 'completed',
        createdAt: '2026-04-01T00:00:00Z',
        stages: [],
      },
      {
        id: 'pl-cur',
        title: 'Asosiy reja',
        status: 'accepted',
        createdAt: '2026-03-01T00:00:00Z',
        stages: [],
      },
      {
        id: 'pl-draft',
        title: 'Qoralama',
        status: 'draft',
        createdAt: '2026-02-01T00:00:00Z',
        stages: [],
      },
      {
        id: 'pl-cancel',
        title: 'Bekor',
        status: 'cancelled',
        createdAt: '2026-05-01T00:00:00Z',
        stages: [],
      },
    ];

    it("joriy reja (eng so'nggi faol) standart: 3 bosishda bosqich mavjud rejaga qo'shiladi", async () => {
      mockChart = PULPIT_CHART;
      mockPlans = PLANS;
      renderApp(<OdontogramTab patientId="p1" />);
      fireEvent.click(screen.getByText('36')); // 1
      expect(screen.getByText(/Asosiy reja/)).toBeInTheDocument();
      const radio = await screen.findByRole('radio', { name: /Ildiz kanalini davolash/ });
      await waitFor(() => expect(radio).toHaveTextContent('1 800 000'));
      fireEvent.click(radio); // 2
      fireEvent.click(screen.getByRole('button', { name: /Rejaga qo'shish/i })); // 3
      expect(createPlanMutate).not.toHaveBeenCalled();
      // o'zgarmagan tashxis qayta snapshot qilinmaydi
      expect(mutate).not.toHaveBeenCalled();
      expect(addStagesMutate).toHaveBeenCalledTimes(1);
      const arg = addStagesMutate.mock.calls[0]?.[0];
      expect(arg.planId).toBe('pl-cur');
      expect(arg.stages).toHaveLength(1);
      expect(arg.stages[0]).toMatchObject({
        serviceId: 'sv-2',
        serviceName: 'Ildiz kanalini davolash',
        cost: 1800000,
        toothNumbers: [36],
        resultingToothState: 'filling',
      });
    });

    it('«Yangi reja» tanlansa yangi reja yaratiladi (joriy rejaga tegilmaydi)', async () => {
      mockChart = PULPIT_CHART;
      mockPlans = PLANS;
      renderApp(<OdontogramTab patientId="p1" />);
      fireEvent.click(screen.getByText('36'));
      fireEvent.click(await screen.findByRole('radio', { name: /Ildiz kanalini davolash/ }));
      fireEvent.click(screen.getByRole('radio', { name: 'Yangi reja' }));
      fireEvent.click(screen.getByRole('button', { name: /Rejaga qo'shish/i }));
      expect(addStagesMutate).not.toHaveBeenCalled();
      expect(createPlanMutate).toHaveBeenCalledTimes(1);
      expect(createPlanMutate.mock.calls[0]?.[0]).toMatchObject({
        patientId: 'p1',
        doctorId: 'u1',
        stages: [expect.objectContaining({ serviceId: 'sv-2', toothNumbers: [36] })],
      });
    });

    it("faol reja yo'q (completed/cancelled) — yangi reja; tashxissiz ham katalogdan xizmat tanlab qo'shiladi", async () => {
      mockChart = { isPrimaryDentition: false, states: [] };
      mockPlans = PLANS.filter((p) => p.status === 'completed' || p.status === 'cancelled');
      renderApp(<OdontogramTab patientId="p1" />);
      fireEvent.click(screen.getByText('11'));
      expect(screen.queryByRole('radio', { name: 'Joriy reja' })).toBeNull();
      const add = screen.getByRole('button', { name: /Rejaga qo'shish/i });
      expect(add).toBeDisabled();
      fireEvent.click(screen.getByRole('textbox', { name: 'Boshqa xizmat tanlash' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Plomba (kompozit)' }));
      await waitFor(() => expect(add).toBeEnabled());
      fireEvent.click(add);
      expect(mutate).not.toHaveBeenCalled();
      expect(createPlanMutate.mock.calls[0]?.[0].stages[0]).toMatchObject({
        serviceId: 'sv-1',
        serviceName: 'Plomba (kompozit)',
        cost: 450000,
        toothNumbers: [11],
      });
    });

    it('natijaviy tish holati tanlanadi va bosqichga tushadi', async () => {
      mockChart = PULPIT_CHART;
      mockPlans = PLANS;
      renderApp(<OdontogramTab patientId="p1" />);
      fireEvent.click(screen.getByText('36'));
      fireEvent.click(await screen.findByRole('radio', { name: /Ildiz kanalini davolash/ }));
      fireEvent.click(screen.getByRole('textbox', { name: 'Bajarilgach tish holati' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Tojcha' }));
      fireEvent.click(screen.getByRole('button', { name: /Rejaga qo'shish/i }));
      expect(addStagesMutate.mock.calls[0]?.[0].stages[0].resultingToothState).toBe('crown');
    });
  });

  describe("FT-01.3: ko'p tish tanlash (Shift / uzun bosish)", () => {
    const CUR = [
      {
        id: 'pl-cur',
        title: 'Asosiy reja',
        status: 'draft',
        createdAt: '2026-03-01T00:00:00Z',
        stages: [],
      },
    ];
    const tooth = (n: number) => screen.getByRole('button', { name: new RegExp(`^${n} — `) });
    const pickOtherService = async (name: string) => {
      fireEvent.click(screen.getByRole('textbox', { name: 'Boshqa xizmat tanlash' }));
      fireEvent.click(await screen.findByRole('option', { name }));
    };

    it("Shift+bosish tishni tanlovga qo'shadi; har tishga alohida bosqich (filial narxi)", async () => {
      mockChart = { isPrimaryDentition: false, states: [] };
      mockPlans = CUR;
      renderApp(<OdontogramTab patientId="p1" />);
      fireEvent.click(tooth(16));
      fireEvent.click(tooth(17), { shiftKey: true });
      expect(tooth(16)).toHaveAttribute('aria-pressed', 'true');
      expect(tooth(17)).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Tishlar: 16, 17')).toBeInTheDocument();
      await pickOtherService('Plomba (kompozit)');
      const add = screen.getByRole('button', { name: /Rejaga qo'shish/i });
      await waitFor(() => expect(add).toBeEnabled());
      fireEvent.click(add);
      const arg = addStagesMutate.mock.calls[0]?.[0];
      expect(arg.planId).toBe('pl-cur');
      expect(arg.stages.map((st: { toothNumbers: number[] }) => st.toothNumbers)).toEqual([
        [16],
        [17],
      ]);
      expect(arg.stages[1]).toMatchObject({ serviceId: 'sv-1', cost: 450000 });
    });

    it("«Bitta bosqich» — barcha tanlangan tishlar bitta bosqichda (ko'prik)", async () => {
      mockChart = { isPrimaryDentition: false, states: [] };
      mockPlans = [];
      renderApp(<OdontogramTab patientId="p1" />);
      fireEvent.click(tooth(26));
      fireEvent.click(tooth(24), { shiftKey: true });
      await pickOtherService('Plomba (kompozit)');
      fireEvent.click(screen.getByRole('checkbox', { name: /Bitta bosqich/ }));
      const add = screen.getByRole('button', { name: /Rejaga qo'shish/i });
      await waitFor(() => expect(add).toBeEnabled());
      fireEvent.click(add);
      const body = createPlanMutate.mock.calls[0]?.[0];
      expect(body.stages).toHaveLength(1);
      expect(body.stages[0].toothNumbers).toEqual([24, 26]);
      expect(body.title).toContain('24, 26');
    });

    it('Shift bilan tanlangan tishni qayta bosish uni olib tashlaydi; oddiy bosish bitta tishga qaytaradi', () => {
      renderApp(<OdontogramTab patientId="p1" />);
      fireEvent.click(tooth(16));
      fireEvent.click(tooth(17), { shiftKey: true });
      fireEvent.click(tooth(18), { shiftKey: true });
      fireEvent.click(tooth(17), { shiftKey: true });
      expect(tooth(17)).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByLabelText('Tishlar: 16, 18')).toBeInTheDocument();
      fireEvent.click(tooth(21));
      expect(tooth(16)).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByLabelText('Tish 21')).toBeInTheDocument();
    });

    it("uzun bosish (planshet) tishni tanlovga qo'shadi, keyingi click tanlovni buzmaydi", async () => {
      renderApp(<OdontogramTab patientId="p1" />);
      fireEvent.click(tooth(16));
      fireEvent.pointerDown(tooth(46));
      await new Promise((r) => setTimeout(r, 650));
      fireEvent.pointerUp(tooth(46));
      fireEvent.click(tooth(46));
      expect(tooth(16)).toHaveAttribute('aria-pressed', 'true');
      expect(tooth(46)).toHaveAttribute('aria-pressed', 'true');
    });

    it("ko'p tishda tanlangan holat har bir tishga qo'llanadi va snapshot'ga tushadi", () => {
      renderApp(<OdontogramTab patientId="p1" />);
      fireEvent.click(tooth(36));
      fireEvent.click(tooth(37), { shiftKey: true });
      fireEvent.click(screen.getByRole('button', { name: 'Kariyes' }));
      fireEvent.click(screen.getByRole('button', { name: /Faqat tashxisni saqlash/ }));
      const states = mutate.mock.calls[0]?.[0].states;
      expect(states).toContainEqual(expect.objectContaining({ toothNumber: 36, state: 'caries' }));
      expect(states).toContainEqual(expect.objectContaining({ toothNumber: 37, state: 'caries' }));
    });
  });
});

describe('OdontogramTab — tish tarixi tabi (FT-01.4)', () => {
  beforeEach(() => {
    mockChart = null;
    mockHistory = [];
    mockPermissions = true;
    mockPlans = [
      {
        id: 'pl-1',
        title: 'Reja 16',
        status: 'in_progress',
        createdAt: '2026-01-01T00:00:00Z',
        stages: [
          {
            id: 'st-1',
            serviceName: 'Plomba 16-tish',
            toothNumbers: [16],
            status: 'completed',
            completedAt: '2026-02-01T00:00:00Z',
            cost: '250000.00',
          },
        ],
      },
    ];
  });

  it('tish tanlanib «Tish tarixi» tabi ochilsa shu tishli bosqich ko‘rinadi, tahrir boshqaruvlari yashirinadi', () => {
    renderApp(<OdontogramTab patientId="p1" />);
    fireEvent.click(screen.getByText('16'));
    expect(screen.queryByText('Plomba 16-tish')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Tish tarixi/i }));
    expect(screen.getByText('Plomba 16-tish')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Rejaga qo'shish/i })).toBeNull();
  });
});
