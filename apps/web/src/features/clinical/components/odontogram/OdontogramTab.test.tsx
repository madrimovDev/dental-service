import { fireEvent, screen } from '@testing-library/react';
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
  useServiceCatalog: () => ({ data: SERVICES }),
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
});
