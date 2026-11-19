import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { BackupSettingsSection } from './BackupSettingsSection';

const hoisted = vi.hoisted(() => ({
  status: { data: undefined as unknown },
  restoreMutate: vi.fn(),
  runMutate: vi.fn(),
  owner: { value: true },
}));

vi.mock('../backup.api', () => ({
  useBackupStatus: () => hoisted.status,
  useRunBackup: () => ({ mutate: hoisted.runMutate, isPending: false }),
  useUpdateBackupFolder: () => ({ mutate: vi.fn(), isPending: false }),
  useRestoreBackup: () => ({ mutate: hoisted.restoreMutate, isPending: false }),
}));
vi.mock('../settings.api', () => ({
  useTenant: () => ({ data: { name: 'Alfa Stomatologiya' } }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: (c: string) => c === '@owner' && hoisted.owner.value }),
}));

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

const desktopStatus = (over: Record<string, unknown> = {}) => ({
  data: {
    mode: 'desktop',
    folder: 'D:\\DentalBackup',
    lastSuccessAt: daysAgo(3),
    lastError: null,
    files: [{ name: 'dental-20261110-200000', sizeBytes: 5 * 1024 * 1024, createdAt: daysAgo(3) }],
    ...over,
  },
});

describe('BackupSettingsSection', () => {
  beforeEach(() => {
    hoisted.restoreMutate.mockReset();
    hoisted.runMutate.mockReset();
    hoisted.owner.value = true;
  });

  it('bulut rejimida hech narsa chizilmaydi', () => {
    hoisted.status.data = {
      mode: 'cloud',
      folder: null,
      lastSuccessAt: null,
      lastError: null,
      files: [],
    };
    renderApp(<BackupSettingsSection />);
    expect(screen.queryByTestId('backup-section')).not.toBeInTheDocument();
  });

  it('>2 kun zaxirasiz: ogohlantirish + papka + nusxa; «Hozir zaxira olish» so‘rov yuboradi', () => {
    hoisted.status = desktopStatus();
    renderApp(<BackupSettingsSection />);
    expect(screen.getByText('Oxirgisi 3 kun oldin')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Zaxira nusxa eskirgan');
    expect(screen.getByLabelText('Zaxira papkasi')).toHaveValue('D:\\DentalBackup');
    expect(screen.getByText('5.0 MB')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hozir zaxira olish' }));
    expect(hoisted.runMutate).toHaveBeenCalledTimes(1);
  });

  it('Tiklash: klinika nomi qo‘lda yozilmaguncha tasdiqlash faol emas; yozilgach to‘g‘ri so‘rov ketadi', async () => {
    hoisted.status = desktopStatus({ lastSuccessAt: daysAgo(0) });
    renderApp(<BackupSettingsSection />);
    fireEvent.click(screen.getByRole('button', { name: /^Tiklash —/ }));

    const confirm = await screen.findByRole('button', { name: 'Tiklash' });
    expect(confirm).toBeDisabled();
    const input = screen.getByLabelText(/Tasdiqlash uchun klinika nomini yozing/);
    fireEvent.change(input, { target: { value: 'Alfa' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Alfa Stomatologiya' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(hoisted.restoreMutate).toHaveBeenCalledWith(
        { file: 'dental-20261110-200000', confirmName: 'Alfa Stomatologiya' },
        expect.any(Object),
      ),
    );
  });

  it('egasi bo‘lmagan: papka o‘zgarmaydi va «Tiklash» tugmasi yo‘q', () => {
    hoisted.owner.value = false;
    hoisted.status = desktopStatus();
    renderApp(<BackupSettingsSection />);
    expect(screen.getByLabelText('Zaxira papkasi')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Tiklash/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Papkani saqlash' })).not.toBeInTheDocument();
  });

  describe('FX-147: oxirgi tiklash natijasi (lastRestore) — lastError dan alohida', () => {
    const fresh = { lastSuccessAt: daysAgo(0) };

    it('muvaffaqiyatsiz, baza qaytarilgan: alohida «Tiklash muvaffaqiyatsiz» banneri + sabab', () => {
      hoisted.status = desktopStatus({
        ...fresh,
        lastRestore: {
          status: 'failed',
          file: 'dental-20261110-200000',
          finishedAt: daysAgo(0),
          error: 'restore_uploads: disk full',
          dbRolledBack: true,
        },
      });
      renderApp(<BackupSettingsSection />);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Tiklash muvaffaqiyatsiz');
      expect(alert).toHaveTextContent('avvalgi holatiga qaytarildi');
      expect(alert).toHaveTextContent('restore_uploads: disk full');
      // Zaxira olish xatosi banneri chiqmaydi (lastError null).
      expect(screen.queryByText('Oxirgi urinish muvaffaqiyatsiz')).not.toBeInTheDocument();
    });

    it('muvaffaqiyatsiz, baza QAYTARILMAGAN: ta’minotchiga murojaat', () => {
      hoisted.status = desktopStatus({
        ...fresh,
        lastRestore: {
          status: 'failed',
          file: 'dental-20261110-200000',
          finishedAt: daysAgo(0),
          error: 'migrate: boom',
          dbRolledBack: false,
        },
      });
      renderApp(<BackupSettingsSection />);
      expect(screen.getByRole('alert')).toHaveTextContent('qaytarib bo‘lmadi');
    });

    it('muvaffaqiyatli tiklash: «Tiklandi» xabari; 7 kundan eski natija ko‘rsatilmaydi', () => {
      hoisted.status = desktopStatus({
        ...fresh,
        lastRestore: {
          status: 'ok',
          file: 'dental-20261110-200000',
          finishedAt: daysAgo(1),
          error: null,
          dbRolledBack: null,
        },
      });
      const { unmount } = renderApp(<BackupSettingsSection />);
      expect(screen.getByRole('status')).toHaveTextContent('Ma’lumotlar zaxiradan tiklandi');
      unmount();

      hoisted.status = desktopStatus({
        ...fresh,
        lastRestore: {
          status: 'failed',
          file: 'dental-20261110-200000',
          finishedAt: daysAgo(10),
          error: 'old',
          dbRolledBack: true,
        },
      });
      renderApp(<BackupSettingsSection />);
      expect(screen.queryByText('Tiklash muvaffaqiyatsiz')).not.toBeInTheDocument();
    });

    it('server «running» desa: jarayon banneri va «Tiklash» tugmalari o‘chiq', () => {
      hoisted.status = desktopStatus({
        ...fresh,
        lastRestore: {
          status: 'running',
          file: 'dental-20261110-200000',
          finishedAt: daysAgo(0),
          error: null,
          dbRolledBack: null,
        },
      });
      renderApp(<BackupSettingsSection />);
      expect(screen.getByRole('status')).toHaveTextContent('Tiklash boshlandi');
      expect(screen.getByRole('button', { name: /^Tiklash —/ })).toBeDisabled();
    });

    it('to‘xtab qolgan tiklash (desktop startup «interrupted» deb yozgan): tugmalar faol, «qaytarilmadi» banneri', () => {
      hoisted.status = desktopStatus({
        ...fresh,
        lastRestore: {
          status: 'failed',
          file: 'dental-20261110-200000',
          finishedAt: daysAgo(0),
          error: "interrupted: tiklash kutilmaganda to'xtadi",
          dbRolledBack: false,
        },
      });
      renderApp(<BackupSettingsSection />);
      expect(screen.queryByText(/Tiklash boshlandi/)).not.toBeInTheDocument();
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Tiklash muvaffaqiyatsiz');
      expect(alert).toHaveTextContent('qaytarib bo‘lmadi');
      expect(alert).toHaveTextContent('interrupted');
      expect(screen.getByRole('button', { name: /^Tiklash —/ })).toBeEnabled();
    });
  });
});
