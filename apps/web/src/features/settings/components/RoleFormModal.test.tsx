import type { PermissionDef } from '@dental/api-client';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { RoleFormModal } from './RoleFormModal';

const upsertMutate = vi.fn();

function perm(code: string): PermissionDef {
  return { id: code, code, category: 'misc', descriptionUz: null, descriptionRu: null };
}

const perms: PermissionDef[] = [
  perm('patient.view'),
  perm('patient.create'),
  perm('cashier.refund'),
];

vi.mock('../settings.api', () => ({
  usePermissions: () => ({ data: perms }),
  useRole: () => ({ data: null }),
  useUpsertRole: () => ({ mutate: upsertMutate, isPending: false }),
}));

describe('RoleFormModal', () => {
  beforeEach(() => {
    upsertMutate.mockClear();
  });

  it('saqlash → tanlangan permission massivi bilan upsert chaqiriladi', async () => {
    renderApp(<RoleFormModal opened onClose={vi.fn()} editing={null} />);

    // Rol nomini kiritish (zod min(2) validatsiyasidan o'tishi uchun)
    fireEvent.change(screen.getByLabelText(/Nom/), { target: { value: 'Registrator' } });

    // PermissionBuilder orqali bitta permission tanlash
    fireEvent.click(screen.getByLabelText('patient.view'));

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
    expect(payload.permissions).toEqual(['patient.view']);
  });
});
