import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';

const upload = vi.fn();
const setPatientPhoto = vi.fn();
vi.mock('@/lib/api', () => ({ api: { patientImages: { upload: (f: FormData) => upload(f) } } }));
vi.mock('@dental/api-client', async (orig) => ({
  ...(await orig<typeof import('@dental/api-client')>()),
  setPatientPhoto: (...a: unknown[]) => setPatientPhoto(...a),
  fetchBlob: vi.fn().mockRejectedValue(new Error('no blob')),
}));

import { PatientHeaderCard } from './PatientHeaderCard';
import { PatientPhotoModal } from './PatientPhotoModal';

beforeEach(() => {
  upload.mockReset().mockResolvedValue({ id: 'img-1' });
  setPatientPhoto.mockReset().mockResolvedValue({ data: {} });
  // Kamera yo'q → fayl yuklash fallback'i.
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
});

const patient = {
  fullName: 'Ali Valiyev',
  phone: null,
  age: null,
  genderLabel: '',
  tags: [],
  source: null,
};

describe('FT-06.2 bemor avatari', () => {
  it('«Rasm qo‘yish» tugmasi faqat onChangePhoto berilganda ko‘rinadi', () => {
    const { unmount } = renderApp(<PatientHeaderCard patient={patient} />);
    expect(screen.queryByRole('button', { name: /Rasm qo'yish/i })).not.toBeInTheDocument();
    unmount();
    renderApp(<PatientHeaderCard patient={patient} onChangePhoto={() => {}} />);
    expect(screen.getByRole('button', { name: /Rasm qo'yish/i })).toBeInTheDocument();
  });

  it('rasm yo‘q — bosh harflar', () => {
    renderApp(<PatientHeaderCard patient={patient} />);
    expect(screen.getByTestId('patient-avatar')).toHaveTextContent('AV');
  });

  it('fayl tanlansa: face_photo yuklanadi, so‘ng PATCH photo imageId bilan', async () => {
    const onClose = vi.fn();
    const { container } = renderApp(<PatientPhotoModal opened onClose={onClose} patientId="p-1" />);
    const input = await waitFor(() => {
      const el = document.body.querySelector('input[type="file"]');
      if (!el) throw new Error('file input yo‘q');
      return el as HTMLInputElement;
    });
    const file = new File(['x'], 'face.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(setPatientPhoto).toHaveBeenCalledWith('p-1', { imageId: 'img-1' }));
    const fd = upload.mock.calls[0]?.[0] as FormData;
    expect(fd.get('type')).toBe('face_photo');
    expect(fd.get('patientId')).toBe('p-1');
    expect(fd.get('file')).toBeInstanceOf(File);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(container).toBeTruthy();
  });
});
