import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { OdontogramTab } from './OdontogramTab';

const mutate = vi.fn();

vi.mock('../../clinical.api', () => ({
  useLatestToothChart: () => ({ data: null, isLoading: false }),
  useCreateToothChart: () => ({ mutate, isPending: false }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

describe('OdontogramTab', () => {
  beforeEach(() => mutate.mockClear());

  it('tish tanlash → holat → save → createToothChart states bilan', () => {
    renderApp(<OdontogramTab patientId="p1" />);
    // tish 11 (FDI) tugmasini bosish → dirty bo'ladi
    fireEvent.click(screen.getByText('11'));
    // Save
    fireEvent.click(screen.getByText(/Snapshot|Saqlash/i));
    expect(mutate).toHaveBeenCalled();
    const arg = mutate.mock.calls[0]?.[0];
    expect(arg).toMatchObject({ patientId: 'p1', isPrimaryDentition: false });
    expect(Array.isArray(arg.states)).toBe(true);
  });
});
