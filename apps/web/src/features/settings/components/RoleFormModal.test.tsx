import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { RoleFormModal } from './RoleFormModal';

const upsertMutate = vi.fn();

vi.mock('../settings.api', () => ({
  useRole: () => ({ data: null }),
  useUpsertRole: () => ({ mutate: upsertMutate, isPending: false }),
}));

describe('RoleFormModal', () => {
  beforeEach(() => {
    upsertMutate.mockClear();
  });

  it("yangi rol saqlash → nom + bo'sh permissions massivi bilan upsert (ruxsatlar inline panelda)", async () => {
    renderApp(<RoleFormModal opened onClose={vi.fn()} editing={null} />);

    // Rol nomini kiritish (zod min(2) validatsiyasidan o'tishi uchun)
    fireEvent.change(screen.getByLabelText(/Nom/), { target: { value: 'Registrator' } });

    // Formani submit qilish
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));

    await waitFor(() => expect(upsertMutate).toHaveBeenCalledTimes(1));

    const payload = upsertMutate.mock.calls[0]?.[0] as {
      id: string | null;
      name: string;
      permissions: string[];
    };
    expect(payload.id).toBeNull();
    expect(payload.name).toBe('Registrator');
    // Ruxsatlar endi inline o'ng panelda tanlanadi — yangi rol bo'sh massiv bilan yaratiladi
    expect(payload.permissions).toEqual([]);
  });
});
