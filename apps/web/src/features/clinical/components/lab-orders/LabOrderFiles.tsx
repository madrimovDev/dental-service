import { fetchBlob } from '@dental/api-client';
import { Mono, StateView, Tag } from '@dental/ui';
import { Button, FileButton, Group, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { downloadAuthedFile } from '@/hooks/useAuthedObjectUrl';
import { api } from '@/lib/api.ts';
import classes from './LabOrderForm.module.css';
import { useLabHubMessages } from './lab-hub.api';
import { useDeleteLabOrderFile, useLabOrderFiles, useUploadLabOrderFile } from './lab-order.api';

const formatBytes = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Brauzerda bevosita ko'rsatiladigan turlar (STL/PLY/OBJ — faqat yuklab olinadi). */
const previewable = (mime: string) => mime.startsWith('image/') || mime === 'application/pdf';

/**
 * FX-50: laboratoriya (Hub) qaytargan fayllar — «Fayllar» ro'yxatida klinika yuklaganlari bilan
 * birga: ko'rish (rasm/PDF yangi tabda) va yuklab olish (Bearer bilan blob).
 */
function HubFilesList({ labOrderId }: { labOrderId: string }) {
  const { t } = useTranslation();
  const messages = useLabHubMessages(labOrderId, true);
  const files = (messages.data ?? []).filter((m) => m.kind === 'file' && m.file);
  if (files.length === 0) return null;
  const fail = () => notifications.show({ color: 'red', message: t('common.error') });
  return (
    <Stack gap="xs" data-testid="lab-returned-files">
      {files.map((m) => {
        const f = m.file;
        if (!f) return null;
        const url = api.labHub.hubFileUrl(labOrderId, f.id);
        const name = f.fileName ?? m.body ?? 'file';
        return (
          <div key={m.id} className={classes.fileRow}>
            <span>
              <Tag>{t('labOrder.files_from_lab')}</Tag> {name} ·{' '}
              <Mono>{formatBytes(f.sizeBytes)}</Mono>
            </span>
            <Group gap={4}>
              {previewable(f.mimeType) && (
                <Button
                  variant="subtle"
                  size="compact-xs"
                  aria-label={`${t('labOrder.file_preview')}: ${name}`}
                  onClick={() => downloadAuthedFile(url, name, { openInNewTab: true }).catch(fail)}
                >
                  {t('labOrder.file_preview')}
                </Button>
              )}
              <Button
                variant="subtle"
                size="compact-xs"
                aria-label={`${t('labHubClinic.file_download')}: ${name}`}
                onClick={() => downloadAuthedFile(url, name).catch(fail)}
              >
                {t('labHubClinic.file_download')}
              </Button>
            </Group>
          </div>
        );
      })}
    </Stack>
  );
}

type Props = { labOrderId: string; canManage: boolean; hubLinked?: boolean };

/** Buyurtma fayllari: ro'yxat, ochish (Bearer bilan blob — P11), qo'shish/o'chirish (manage). */
export function LabOrderFiles({ labOrderId, canManage, hubLinked = false }: Props) {
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
      {rows.length === 0 && !hubLinked && (
        <div className={classes.hint}>{t('labOrder.files_empty')}</div>
      )}
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
      {hubLinked && <HubFilesList labOrderId={labOrderId} />}
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
          {/* Mobil: to'g'ridan-to'g'ri kamera (FX-50) — tanlash tugmasi alohida qoladi. */}
          <FileButton
            accept="image/*"
            capture="environment"
            onChange={(file) => file && uploadMut.mutate({ labOrderId, file })}
          >
            {(props) => (
              <Button variant="default" size="xs" loading={uploadMut.isPending} {...props}>
                {t('labOrder.add_photo')}
              </Button>
            )}
          </FileButton>
          <span className={classes.hint}>{t('labOrder.files_hint')}</span>
        </Group>
      )}
    </Stack>
  );
}
