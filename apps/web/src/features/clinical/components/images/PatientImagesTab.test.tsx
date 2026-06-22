import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { PatientImagesTab } from './PatientImagesTab';

const deleteMutate = vi.fn();
const img = {
  id: 'i1',
  type: 'intraoral_photo',
  url: 'http://x/i1',
  contentType: 'image/png',
  sizeBytes: 2048,
  title: 'Foto',
  originalFilename: 'f.png',
  description: null,
  toothNumbers: [11],
  takenDate: null,
  createdAt: '2026-06-11T00:00:00Z',
};

vi.mock('../../clinical.api', () => ({
  usePatientImages: () => ({ data: [img], isLoading: false }),
  useUploadPatientImage: () => ({ mutate: vi.fn(), isPending: false }),
  useDeletePatientImage: () => ({ mutate: deleteMutate, isPending: false }),
  useVisitNotes: () => ({ data: [], isLoading: false }),
}));
let perm = true;
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => perm }),
}));

describe('PatientImagesTab', () => {
  it('delete → Mantine confirm modal → tasdiqda deletePatientImage', async () => {
    perm = true;
    renderApp(<PatientImagesTab patientId="p1" />);
    // delete ActionIcon (aria-label common.delete = "O'chirish") — birinchisini bos
    const delButtons = screen.getAllByLabelText(/O'chirish|Удалить/i);
    fireEvent.click(delButtons[0] as HTMLElement);
    // confirm modal ochilgan (portal — async) — "O'chirish" tugmasini bos
    await waitFor(() => expect(screen.getAllByText(/O'chirish/i).length).toBeGreaterThan(1));
    const confirmBtn = screen.getAllByText(/O'chirish/i).slice(-1)[0] as HTMLElement;
    fireEvent.click(confirmBtn);
    expect(deleteMutate).toHaveBeenCalledWith('i1', expect.anything());
  });
});
