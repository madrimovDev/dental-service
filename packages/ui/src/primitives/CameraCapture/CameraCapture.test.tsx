import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderUI } from '../../test-utils';
import { CameraCapture, type CameraCaptureLabels } from './CameraCapture';

const labels: CameraCaptureLabels = {
  capture: 'Suratga olish',
  retake: 'Qayta olish',
  use: 'Foydalanish',
  switchCamera: 'Kamerani almashtirish',
  upload: 'Fayl yuklash',
  cancel: 'Bekor qilish',
  starting: 'Kamera yoqilmoqda',
  denied: 'Kameraga ruxsat berilmadi',
  notFound: 'Kamera topilmadi',
  unsupported: 'Kamera bu qurilmada qo‘llanmaydi',
  failed: 'Kamera ochilmadi',
  previewAlt: 'Olingan surat',
  videoLabel: 'Kamera ko‘rinishi',
};

interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
}
const makeStream = () => {
  const track: FakeTrack = { stop: vi.fn() };
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
};

const setMediaDevices = (getUserMedia: unknown) => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: getUserMedia === undefined ? undefined : { getUserMedia },
  });
};

beforeEach(() => {
  // jsdom: video/canvas/URL yo'q
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    configurable: true,
    writable: true,
    value: null,
  });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
    configurable: true,
    value: 640,
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
    configurable: true,
    value: 480,
  });
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ drawImage: vi.fn() });
  HTMLCanvasElement.prototype.toBlob = vi.fn((cb: BlobCallback) =>
    cb(new Blob(['jpeg-bytes'], { type: 'image/jpeg' })),
  ) as unknown as HTMLCanvasElement['toBlob'];
  URL.createObjectURL = vi.fn().mockReturnValue('blob:preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('CameraCapture', () => {
  it('oqimni ochadi, suratga oladi, tasdiqlanganda File beradi va oqimni to‘xtatadi', async () => {
    const { stream, track } = makeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    setMediaDevices(getUserMedia);
    const onCapture = vi.fn();
    renderUI(<CameraCapture labels={labels} onCapture={onCapture} />);

    const shutter = await screen.findByRole('button', { name: 'Suratga olish' });
    await waitFor(() => expect(shutter).toBeEnabled());
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'user' },
      audio: false,
    });
    fireEvent.click(shutter);

    expect(await screen.findByAltText('Olingan surat')).toBeInTheDocument();
    expect(track.stop).toHaveBeenCalled(); // surat olingach kamera o'chadi
    fireEvent.click(screen.getByRole('button', { name: 'Foydalanish' }));
    expect(onCapture).toHaveBeenCalledOnce();
    const file = onCapture.mock.calls[0]?.[0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/jpeg');
    expect(file.name).toMatch(/\.jpg$/);
  });

  it('qayta olish — yangi oqim ochadi', async () => {
    const a = makeStream();
    const b = makeStream();
    const getUserMedia = vi.fn().mockResolvedValueOnce(a.stream).mockResolvedValueOnce(b.stream);
    setMediaDevices(getUserMedia);
    renderUI(<CameraCapture labels={labels} onCapture={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Suratga olish' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Qayta olish' }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'Suratga olish' })).toBeInTheDocument();
  });

  it('kamerani almashtirish — orqa kamera (environment) so‘raladi', async () => {
    const a = makeStream();
    const b = makeStream();
    const getUserMedia = vi.fn().mockResolvedValueOnce(a.stream).mockResolvedValueOnce(b.stream);
    setMediaDevices(getUserMedia);
    renderUI(<CameraCapture labels={labels} onCapture={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Kamerani almashtirish' }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(getUserMedia.mock.calls[1]?.[0]).toEqual({
      video: { facingMode: 'environment' },
      audio: false,
    });
    expect(a.track.stop).toHaveBeenCalled();
  });

  it('ruxsat rad etilsa — xabar + fayl yuklash fallback ishlaydi + onUnavailable(denied)', async () => {
    setMediaDevices(
      vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' })),
    );
    const onCapture = vi.fn();
    const onUnavailable = vi.fn();
    const { container } = renderUI(
      <CameraCapture labels={labels} onCapture={onCapture} onUnavailable={onUnavailable} />,
    );
    expect(await screen.findByText('Kameraga ruxsat berilmadi')).toBeInTheDocument();
    expect(onUnavailable).toHaveBeenCalledWith('denied');
    expect(screen.queryByRole('button', { name: 'Suratga olish' })).not.toBeInTheDocument();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('image/*');
    const f = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [f] } });
    expect(onCapture).toHaveBeenCalledWith(f);
  });

  it('getUserMedia yo‘q (xavfsiz bo‘lmagan kontekst) — unsupported', async () => {
    setMediaDevices(undefined);
    const onUnavailable = vi.fn();
    renderUI(<CameraCapture labels={labels} onCapture={vi.fn()} onUnavailable={onUnavailable} />);
    expect(await screen.findByText('Kamera bu qurilmada qo‘llanmaydi')).toBeInTheDocument();
    expect(onUnavailable).toHaveBeenCalledWith('unsupported');
  });

  it('kamera topilmasa — notFound', async () => {
    setMediaDevices(
      vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotFoundError' })),
    );
    const onUnavailable = vi.fn();
    renderUI(<CameraCapture labels={labels} onCapture={vi.fn()} onUnavailable={onUnavailable} />);
    expect(await screen.findByText('Kamera topilmadi')).toBeInTheDocument();
    expect(onUnavailable).toHaveBeenCalledWith('not_found');
  });

  it('unmount — kamera oqimi to‘xtatiladi (chiroq o‘chadi)', async () => {
    const { stream, track } = makeStream();
    setMediaDevices(vi.fn().mockResolvedValue(stream));
    const { unmount } = renderUI(<CameraCapture labels={labels} onCapture={vi.fn()} />);
    await screen.findByRole('button', { name: 'Suratga olish' });
    unmount();
    expect(track.stop).toHaveBeenCalled();
  });

  it('bekor qilish tugmasi onCancel chaqiradi', async () => {
    setMediaDevices(vi.fn().mockResolvedValue(makeStream().stream));
    const onCancel = vi.fn();
    renderUI(<CameraCapture labels={labels} onCapture={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bekor qilish' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
