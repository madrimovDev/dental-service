import type { BackupFile, BackupStatus } from '@dental/api-client';
import {
  getBackupStatus,
  restoreBackup,
  runBackup,
  updateBackupSettings,
} from '@dental/api-client';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { i18n } from '@/lib/i18n.ts';

/** Zaxira nusxa (UI-3 / D.1) — `/api/backup/*`. */
export type { BackupFile, BackupStatus };

const backupKeys = { status: () => ['settings', 'backup', 'status'] as const };

export function useBackupStatus() {
  return useQuery({
    queryKey: backupKeys.status(),
    queryFn: () => getBackupStatus().then((r) => r.data),
    // Bulut (404/cloud) yoki ruxsat yo'q (403) — bo'lim ko'rinmaydi; qayta urinish kerak emas.
    retry: false,
    refetchInterval: 15_000,
  });
}

export function useRunBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => runBackup(),
    onSuccess: () => {
      // Electron main so'rovni ~2 s ichida oladi — ro'yxat biroz keyin yangilanadi.
      setTimeout(() => void qc.invalidateQueries({ queryKey: backupKeys.status() }), 4000);
    },
  });
}

export function useUpdateBackupFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folder: string) => updateBackupSettings({ folder }),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.status() }),
    // Papka yo'q/yozilmaydi (400) — umumiy xato o'rniga aniq sabab.
    onError: () => notifications.show({ color: 'red', message: i18n.t('backup.folderInvalid') }),
  });
}

export function useRestoreBackup() {
  return useMutation({
    mutationFn: (input: { file: string; confirmName: string }) => restoreBackup(input),
  });
}
