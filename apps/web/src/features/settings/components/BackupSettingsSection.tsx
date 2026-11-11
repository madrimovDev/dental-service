import { AlertBanner, CriticalActionDialog } from '@dental/ui';
import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  type BackupFile,
  useBackupStatus,
  useRestoreBackup,
  useRunBackup,
  useUpdateBackupFolder,
} from '../backup.api';
import { useTenant } from '../settings.api';

/** >2 kun zaxirasiz — ogohlantirish (roadmap §4.1). */
const STALE_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

const CARD_STYLE: React.CSSProperties = {
  borderRadius: 'var(--radius-card)',
  padding: '16px 18px',
  background: 'var(--surface)',
  boxShadow: 'var(--shadow-sm)',
};

const formatSize = (bytes: number): string => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

/**
 * Sozlamalar → Zaxira nusxa (faqat desktop). Papka, «Hozir zaxira olish», nusxalar ro'yxati va
 * egasi uchun «Tiklash» (CriticalActionDialog + klinika nomini qo'lda yozish). Bulut (SaaS) rejimida
 * yoki ruxsat bo'lmasa hech narsa chizilmaydi. Lane B `SettingsShell`ga shu komponentni joylaydi.
 */
export function BackupSettingsSection() {
  const { t } = useTranslation();
  const isOwner = useAuthStore().hasPermission('@owner');
  const status = useBackupStatus();
  const tenant = useTenant();
  const run = useRunBackup();
  const saveFolder = useUpdateBackupFolder();
  const restore = useRestoreBackup();

  const [folder, setFolder] = useState('');
  const [restoreTarget, setRestoreTarget] = useState<BackupFile | null>(null);
  const [typedName, setTypedName] = useState('');
  const [restoring, setRestoring] = useState(false);

  const serverFolder = status.data?.folder ?? '';
  useEffect(() => setFolder(serverFolder), [serverFolder]);

  const data = status.data;
  if (!data || data.mode !== 'desktop') return null;

  const clinicName = tenant.data?.name ?? '';
  const lastMs = data.lastSuccessAt ? new Date(data.lastSuccessAt).getTime() : null;
  const days = lastMs === null ? null : Math.floor((Date.now() - lastMs) / DAY_MS);
  const stale = days === null || days > STALE_DAYS;
  const failed = data.lastError !== null;
  const level = stale ? 'danger' : failed ? 'warning' : 'ok';
  const borderColor =
    level === 'danger' ? 'var(--danger)' : level === 'warning' ? 'var(--warning)' : 'var(--border)';

  const lastLabel =
    days === null
      ? t('backup.never')
      : days === 0
        ? t('backup.lastToday')
        : t('backup.lastDaysAgo', { days });

  const closeRestore = () => {
    setRestoreTarget(null);
    setTypedName('');
  };

  const confirmRestore = () => {
    if (!restoreTarget) return;
    restore.mutate(
      { file: restoreTarget.name, confirmName: typedName },
      {
        onSuccess: () => {
          setRestoring(true);
          notifications.show({ color: 'teal', message: t('backup.restoreStarted') });
          closeRestore();
        },
        onError: () => notifications.show({ color: 'red', message: t('backup.restoreFailed') }),
      },
    );
  };

  return (
    <section
      aria-labelledby="backup-h"
      style={{ ...CARD_STYLE, border: `2px solid ${borderColor}` }}
      data-testid="backup-section"
    >
      <Stack gap={10}>
        <Text component="h2" id="backup-h" fz={17} fw={700} c="var(--ink)" m={0}>
          {t('backup.title')}
        </Text>
        <Text fz={18} fw={700} c={level === 'danger' ? 'var(--danger)' : 'var(--ink)'}>
          {lastLabel}
        </Text>
        <Text fz={14} c="var(--ink-2)">
          {t('backup.desc')}
        </Text>

        {stale && (
          <AlertBanner tier={2} title={t('backup.staleTitle')}>
            {days === null ? t('backup.staleNever') : t('backup.staleBody', { days })}
          </AlertBanner>
        )}
        {failed && (
          <AlertBanner tier={2} title={t('backup.errorTitle')}>
            {data.lastError}
          </AlertBanner>
        )}
        {restoring && <AlertBanner tier={3}>{t('backup.restoreInProgress')}</AlertBanner>}

        <TextInput
          label={t('backup.folderLabel')}
          description={isOwner ? t('backup.folderHint') : t('backup.ownerOnly')}
          value={folder}
          onChange={(e) => setFolder(e.currentTarget.value)}
          disabled={!isOwner}
        />
        <Group gap={8}>
          <Button
            variant="primary"
            size="md"
            loading={run.isPending}
            onClick={() =>
              run.mutate(undefined, {
                onSuccess: () =>
                  notifications.show({ color: 'teal', message: t('backup.runRequested') }),
              })
            }
          >
            {t('backup.runNow')}
          </Button>
          {isOwner && (
            <Button
              variant="default"
              size="md"
              loading={saveFolder.isPending}
              disabled={folder.trim() === '' || folder === serverFolder}
              onClick={() =>
                saveFolder.mutate(folder.trim(), {
                  onSuccess: () =>
                    notifications.show({ color: 'teal', message: t('backup.folderSaved') }),
                })
              }
            >
              {t('backup.folderSave')}
            </Button>
          )}
        </Group>

        <Text fz={14} fw={700} c="var(--ink)" mt={4}>
          {t('backup.listTitle')}
        </Text>
        {data.files.length === 0 ? (
          <Text fz={14} c="var(--ink-3)">
            {t('backup.empty')}
          </Text>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {data.files.map((f) => (
              <li
                key={f.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 44,
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ marginRight: 'auto' }}>
                  <b style={{ fontWeight: 600 }}>{new Date(f.createdAt).toLocaleString('uz-UZ')}</b>
                  <span style={{ color: 'var(--ink-3)', marginLeft: 8, fontSize: 13 }}>
                    {formatSize(f.sizeBytes)}
                  </span>
                </span>
                {isOwner && (
                  <Button
                    variant="default"
                    size="sm"
                    aria-label={`${t('backup.restore')} — ${new Date(f.createdAt).toLocaleString('uz-UZ')}`}
                    disabled={restoring}
                    onClick={() => setRestoreTarget(f)}
                  >
                    {t('backup.restore')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Stack>

      <CriticalActionDialog
        opened={restoreTarget !== null}
        title={t('backup.restoreTitle')}
        safeLabel={t('backup.restoreCancel')}
        dangerLabel={t('backup.restoreConfirm')}
        confirmDisabled={typedName !== clinicName || clinicName === '' || restore.isPending}
        onSafe={closeRestore}
        onConfirm={confirmRestore}
      >
        <Stack gap={10}>
          <Text fz={14}>
            {t('backup.restoreBody', {
              date: restoreTarget ? new Date(restoreTarget.createdAt).toLocaleString('uz-UZ') : '',
            })}
          </Text>
          <TextInput
            label={t('backup.confirmNameLabel', { name: clinicName })}
            value={typedName}
            onChange={(e) => setTypedName(e.currentTarget.value)}
            autoComplete="off"
            data-autofocus
          />
        </Stack>
      </CriticalActionDialog>
    </section>
  );
}
