import type { StaffProfile } from '@dental/api-client';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { StaffProfileModal } from './StaffProfileModal';

const upsertMutate = vi.fn();

const existing: StaffProfile = {
  id: 'p1',
  tenantId: 't1',
  userId: 'u1',
  specialty: 'Ortodont',
  employmentStatus: 'active',
  startedAt: '2026-01-15',
  baseSalary: '500000',
  commissionPercent: '10',
  createdAt: '2026-01-15T00:00:00Z',
  updatedAt: '2026-01-15T00:00:00Z',
};

let profileData: StaffProfile | null = existing;

vi.mock('../settings.api', () => ({
  useStaffProfile: () => ({ data: profileData, isLoading: false, isFetched: true }),
  useUpsertProfile: () => ({ mutate: upsertMutate, isPending: false }),
}));

describe('StaffProfileModal', () => {
  beforeEach(() => {
    upsertMutate.mockClear();
    profileData = existing;
  });

  it("mavjud profil qiymatlari forma to'ldiradi va to'liq holat bilan upsert chaqiradi", async () => {
    renderApp(<StaffProfileModal userId="u1" userName="Ali Valiyev" onClose={vi.fn()} />);

    // Mavjud qiymat to'ldirilgan (string→Number, specialty)
    expect((screen.getByLabelText('Mutaxassislik') as HTMLInputElement).value).toBe('Ortodont');

    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));

    await waitFor(() => expect(upsertMutate).toHaveBeenCalledTimes(1));

    const payload = upsertMutate.mock.calls[0]?.[0] as {
      specialty?: string;
      employmentStatus: string;
      startedAt?: string;
      baseSalary: number;
      commissionPercent: number;
    };
    expect(payload.specialty).toBe('Ortodont');
    expect(payload.employmentStatus).toBe('active');
    expect(payload.startedAt).toBe('2026-01-15');
    expect(payload.baseSalary).toBe(500000);
    expect(payload.commissionPercent).toBe(10);
  });

  it("profil yo'q bo'lsa (null) bo'sh forma — baseSalary 0 bilan upsert", async () => {
    profileData = null;
    renderApp(<StaffProfileModal userId="u2" userName="Vali Aliyev" onClose={vi.fn()} />);

    expect((screen.getByLabelText('Mutaxassislik') as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));

    await waitFor(() => expect(upsertMutate).toHaveBeenCalledTimes(1));
    const payload = upsertMutate.mock.calls[0]?.[0] as {
      baseSalary: number;
      commissionPercent: number;
    };
    expect(payload.baseSalary).toBe(0);
    expect(payload.commissionPercent).toBe(0);
  });
});
