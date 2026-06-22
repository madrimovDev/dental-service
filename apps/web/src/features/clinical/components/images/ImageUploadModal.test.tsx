import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { ImageUploadModal } from './ImageUploadModal';

const uploadMutate = vi.fn();
vi.mock('../../clinical.api', () => ({
  useUploadPatientImage: () => ({ mutate: uploadMutate, isPending: false }),
  useVisitNotes: () => ({ data: [], isLoading: false }),
}));

describe('ImageUploadModal', () => {
  it('file tanlanganda upload FormData bilan chaqiriladi', () => {
    renderApp(<ImageUploadModal opened onClose={vi.fn()} patientId="p1" />);
    // Modal renders into a portal (document.body), not the render container
    const fileInput = document.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File(['x'], 'foto.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    // image.upload = "Yuklash" — modal title + submit button both match; target the button
    fireEvent.click(screen.getByRole('button', { name: 'Yuklash' }));
    expect(uploadMutate).toHaveBeenCalled();
    const fd = uploadMutate.mock.calls[0]?.[0] as FormData;
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('patientId')).toBe('p1');
    expect(fd.get('type')).toBe('intraoral_photo');
  });
});
