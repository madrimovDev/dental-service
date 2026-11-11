import { customInstance } from '@dental/api-client';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { i18n } from '@/lib/i18n.ts';

/**
 * Zaxira nusxa (UI-3 / D.1) — `/api/backup/*`.
 *
 * ⚠️ `generate:contract` hali ishlatilmagan (integratsiya lane'i qiladi) — shu sabab orval
 * funksiyalari yo'q va so'rovlar api-client mutator (`customInstance`: auth + 401 refresh) orqali
 * yuboriladi. Contract generatsiyadan keyin bu fayl `getBackupStatus`/`runBackup`/
 * `updateBackupSettings`/`restoreBackup` orval funksiyalariga o'tkaziladi (tiplar bir xil).
 */
export type BackupFile = { name: string; sizeBytes: number; createdAt: string };
export type BackupStatus = {
  mode: 'desktop' | 'cloud';
  folder: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  files: BackupFile[];
};

type Envelope<T> = { success: true; data: T };

const backupKeys = { status: () => ['settings', 'backup', 'status'] as const };

export function useBackupStatus() {
  return useQuery({
    queryKey: backupKeys.status(),
    queryFn: () =>
      customInstance<Envelope<BackupStatus>>({ url: '/api/backup/status', method: 'GET' }).then(
        (r) => r.data,
      ),
    // Bulut (404/cloud) yoki ruxsat yo'q (403) — bo'lim ko'rinmaydi; qayta urinish kerak emas.
    retry: false,
    refetchInterval: 15_000,
  });
}

export function useRunBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      customInstance<Envelope<{ requested: true }>>({ url: '/api/backup/run', method: 'POST' }),
    onSuccess: () => {
      // Electron main so'rovni ~2 s ichida oladi — ro'yxat biroz keyin yangilanadi.
      setTimeout(() => void qc.invalidateQueries({ queryKey: backupKeys.status() }), 4000);
    },
  });
}

export function useUpdateBackupFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folder: string) =>
      customInstance<Envelope<{ folder: string }>>({
        url: '/api/backup/settings',
        method: 'PUT',
        data: { folder },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.status() }),
    // Papka yo'q/yozilmaydi (400) — umumiy xato o'rniga aniq sabab.
    onError: () => notifications.show({ color: 'red', message: i18n.t('backup.folderInvalid') }),
  });
}

export function useRestoreBackup() {
  return useMutation({
    mutationFn: (input: { file: string; confirmName: string }) =>
      customInstance<Envelope<{ requested: true }>>({
        url: '/api/backup/restore',
        method: 'POST',
        data: input,
      }),
  });
}
