import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import type { PatientImageVM } from '../../clinical.types';
import { ImageCard } from './ImageCard';

const fetchBlob = vi.fn();
vi.mock('@dental/api-client', async (orig) => ({
  ...(await orig<typeof import('@dental/api-client')>()),
  fetchBlob: (...a: unknown[]) => fetchBlob(...a),
}));

const vm = {
  id: 'i1',
  url: '/uploads/tenants%2Ft%2Fi1.png',
  isImage: true,
  displayTitle: 'Foto',
  originalFilename: 'f.png',
  contentType: 'image/png',
  sizeLabel: '2 KB',
  typeLabelKey: 'image.type.intraoral_photo',
  toothNumbers: [],
} as unknown as PatientImageVM;

beforeEach(() => {
  fetchBlob.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:authed/1');
  URL.revokeObjectURL = vi.fn();
});

describe('ImageCard (P11)', () => {
  it('rasm xom /uploads URL emas, Bearer’li blob URL bilan ko‘rsatiladi', async () => {
    fetchBlob.mockResolvedValue(new Blob(['x']));
    renderApp(
      <ImageCard vm={vm} canUpload={false} onPreview={() => {}} onRequestDelete={() => {}} />,
    );
    const img = await screen.findByAltText('Foto');
    await waitFor(() => expect(img.getAttribute('src')).toBe('blob:authed/1'));
    expect(fetchBlob).toHaveBeenCalledWith(vm.url, expect.any(AbortSignal));
    expect(img.getAttribute('src')).not.toContain('/uploads');
  });
});
