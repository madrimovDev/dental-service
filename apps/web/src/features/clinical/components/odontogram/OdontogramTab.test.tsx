import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { OdontogramTab } from './OdontogramTab';

const mutate = vi.fn();
// biome-ignore lint/suspicious/noExplicitAny: test mock chart fixture
let mockChart: any = null;
// biome-ignore lint/suspicious/noExplicitAny: test mock history fixture
let mockHistory: any[] = [];

vi.mock('../../clinical.api', () => ({
  useLatestToothChart: () => ({ data: mockChart, isLoading: false }),
  useToothChartHistory: () => ({ data: mockHistory }),
  useDiagnoses: () => ({
    data: [{ id: 'dx-1', code: 'K02.1', nameUz: 'Kariyes', nameRu: 'Кариес' }],
  }),
  useCreateToothChart: () => ({ mutate, isPending: false }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

const saveButton = () => screen.getByText(/Snapshot|Saqlash/i).closest('button')!;

describe('OdontogramTab', () => {
  beforeEach(() => {
    mutate.mockClear();
    mockChart = null;
    mockHistory = [];
  });

  it("bo'sh chart + tish tanlash Save ni yoqmaydi (CLI-105 empty-save erase)", () => {
    renderApp(<OdontogramTab patientId="p1" />);
    // Tish tanlash faqat seleksiya — draftState yo'q → Save o'chiq (kartani o'chirmaydi)
    fireEvent.click(screen.getByText('11'));
    expect(saveButton()).toBeDisabled();
  });

  it('mavjud chart yuklanganda Save states bilan yuboradi', () => {
    mockChart = {
      isPrimaryDentition: false,
      states: [{ toothNumber: 11, surface: 'whole', state: 'caries' }],
    };
    renderApp(<OdontogramTab patientId="p1" />);
    fireEvent.click(saveButton());
    expect(mutate).toHaveBeenCalled();
    const arg = mutate.mock.calls[0]?.[0];
    expect(arg).toMatchObject({ patientId: 'p1', isPrimaryDentition: false });
    expect(arg.states.length).toBe(1);
  });

  it('CLI-189: saqlangan non-whole surface + diagnosisId round-trip yuboriladi', () => {
    // Snapshot O-yuza + diagnoz bilan yuklanadi → Save o'sha qiymatlarni qaytaradi
    mockChart = {
      isPrimaryDentition: false,
      states: [{ toothNumber: 16, surface: 'O', state: 'filling', diagnosisId: 'dx-1' }],
    };
    renderApp(<OdontogramTab patientId="p1" />);
    fireEvent.click(saveButton());
    const arg = mutate.mock.calls[0]?.[0];
    expect(arg.states).toContainEqual({
      toothNumber: 16,
      state: 'filling',
      surface: 'O',
      diagnosisId: 'dx-1',
    });
  });

  it('CLI-189: tish tanlab surface + diagnoz tanlash → save payload (entry interaction)', () => {
    // Bo'sh chart: tish tanlanadi, surface 'D' + diagnoz UI orqali kiritiladi
    renderApp(<OdontogramTab patientId="p1" />);
    fireEvent.click(screen.getByText('16'));

    // Surface Select ochiladi → 'D' (Distal) tanlanadi
    const surfaceSelect = screen.getByRole('textbox', { name: /Tish yuzasi/i });
    fireEvent.click(surfaceSelect);
    fireEvent.click(screen.getByText(/Distal \(D\)/i));

    // Diagnoz Select → mock diagnoz tanlanadi
    const dxSelect = screen.getByRole('textbox', { name: /Diagnoz/i });
    fireEvent.click(dxSelect);
    fireEvent.click(screen.getByText(/K02\.1/));

    fireEvent.click(saveButton());
    const arg = mutate.mock.calls[0]?.[0];
    expect(arg.states).toContainEqual({
      toothNumber: 16,
      state: 'healthy',
      surface: 'D',
      diagnosisId: 'dx-1',
    });
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
    // hozircha tahrirlash rejimi → Save bor
    expect(screen.queryByText(/Snapshot|Saqlash/i)).toBeTruthy();
    // eski snapshot tanlash → read-only banner + "return to current"
    const historySelect = screen.getByPlaceholderText(/Tarix|истори/i);
    fireEvent.click(historySelect);
    // Yagona snapshot opsiyasi — rol bo'yicha tanlaymiz (TZ/locale formatiga bog'liq emas)
    fireEvent.click(screen.getByRole('option'));
    expect(screen.getByText(/qaytish|вернуться/i)).toBeTruthy();
  });
});
