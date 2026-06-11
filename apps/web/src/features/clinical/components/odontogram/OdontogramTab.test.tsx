import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { OdontogramTab } from './OdontogramTab';

const mutate = vi.fn();
// biome-ignore lint/suspicious/noExplicitAny: test mock chart fixture
let mockChart: any = null;

vi.mock('../../clinical.api', () => ({
  useLatestToothChart: () => ({ data: mockChart, isLoading: false }),
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
});
