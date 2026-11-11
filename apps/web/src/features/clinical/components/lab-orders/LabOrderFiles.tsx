import { fetchBlob } from '@dental/api-client';
import { Mono, StateView } from '@dental/ui';
import { Button, FileButton, Group, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import classes from './LabOrderForm.module.css';
import { useDeleteLabOrderFile, useLabOrderFiles, useUploadLabOrderFile } from './lab-order.api';

const formatBytes = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

type Props = { labOrderId: string; canManage: boolean };

/** Buyurtma fayllari: ro'yxat, ochish (Bearer bilan blob — P11), qo'shish/o'chirish (manage). */
export function LabOrderFiles({ labOrderId, canManage }: Props) {
  const { t } = useTranslation();
  const query = useLabOrderFiles(labOrderId);
  const uploadMut = useUploadLabOrderFile();
  const deleteMut = useDeleteLabOrderFile(labOrderId);

  const open = async (url: string) => {
    try {
      const blob = await fetchBlob(url);
      window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch {
      notifications.show({ color: 'red', message: t('common.error') });
    }
  };

  if (query.isError) {
    return (
      <StateView
        status="error"
        title={t('states.error_title')}
        retryLabel={t('states.retry')}
        onRetry={() => query.refetch()}
      />
    );
  }
  if (query.isLoading) return <StateView status="loading" skeleton="cards" />;

  const rows = query.data ?? [];
  return (
    <Stack gap="xs">
      {rows.length === 0 && <div className={classes.hint}>{t('labOrder.files_empty')}</div>}
      {rows.map((f) => (
        <div key={f.id} className={classes.fileRow}>
          <button
            type="button"
            onClick={() => open(f.url)}
            style={{
              background: 'none',
              border: 0,
              color: 'var(--primary-strong)',
              cursor: 'pointer',
              padding: 0,
              textAlign: 'left',
            }}
            aria-label={`${t('labOrder.file_open')}: ${f.originalFilename}`}
          >
            {f.label ? `${f.label} · ` : ''}
            {f.originalFilename} · <Mono>{formatBytes(f.sizeBytes)}</Mono>
          </button>
          {canManage && (
            <Button
              variant="subtle"
              color="red"
              size="compact-xs"
              loading={deleteMut.isPending}
              aria-label={`${t('labOrder.file_remove')}: ${f.originalFilename}`}
              onClick={() => deleteMut.mutate(f.id)}
            >
              <IconTrash size={14} />
            </Button>
          )}
        </div>
      ))}
      {canManage && (
        <Group>
          <FileButton
            accept="image/jpeg,image/png,image/webp,application/pdf,.stl,.ply,.obj"
            onChange={(file) => file && uploadMut.mutate({ labOrderId, file })}
          >
            {(props) => (
              <Button variant="default" size="xs" loading={uploadMut.isPending} {...props}>
                {t('labOrder.add_file')}
              </Button>
            )}
          </FileButton>
          <span className={classes.hint}>{t('labOrder.files_hint')}</span>
        </Group>
      )}
    </Stack>
  );
}
