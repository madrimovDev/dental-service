import { AlertBanner, StatusPill } from '@dental/ui';
import { Button, Group, Select, Stack, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format';
import classes from './LabOrderForm.module.css';
import {
  activeLabs,
  useApproveLabPrice,
  useLabHubLabs,
  useLabHubMessages,
  useLabHubStatus,
  usePostLabHubMessage,
  useSendToLabHub,
} from './lab-hub.api';
import type { LabOrderWire } from './lab-order.helpers';

type Meaning = 'planned' | 'confirmed' | 'waiting' | 'active' | 'done' | 'failed';

const SYNC_TONE: Record<string, Meaning> = {
  pending: 'waiting',
  synced: 'confirmed',
  failed: 'failed',
};
const HUB_TONE: Record<string, Meaning> = {
  sent: 'planned',
  accepted: 'confirmed',
  in_progress: 'active',
  ready: 'done',
  delivered: 'done',
  rejected: 'failed',
  remake: 'waiting',
};

const errorCode = (err: unknown) => (err as { code?: string } | null)?.code ?? '';

/**
 * Lab buyurtma sahifasidagi Lab Hub bloki (W2): portal orqali yuborish, sinxron belgisi,
 * lab holati (rad etish sababi bilan), narx taklifi + «Tasdiqlash» (L4) va yozishma.
 */
export function LabOrderHubPanel({
  order,
  canManage,
}: {
  order: LabOrderWire;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const linked = !!order.labHubLabId;
  const status = useLabHubStatus();
  const connected = status.data?.connected === true;
  const canSend =
    !linked && canManage && connected && (order.status === 'draft' || order.status === 'sent');
  const labs = useLabHubLabs({ enabled: canSend });
  const send = useSendToLabHub();
  const approve = useApproveLabPrice(order.id);
  const messages = useLabHubMessages(order.id, linked);
  const post = usePostLabHubMessage(order.id);
  const [labId, setLabId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const errText = (err: unknown) =>
    t(`labHubClinic.err_${errorCode(err).replace(/\./g, '_')}`, t('labHubClinic.err_generic'));

  if (!linked) {
    if (!canManage || status.isLoading) return null;
    if (!connected) {
      return (
        <section className={classes.card} aria-labelledby="hub-h">
          <h3 id="hub-h" className={classes.cardTitle}>
            {t('labHubClinic.hub_section')}
          </h3>
          <div className={classes.hint}>{t('labHubClinic.not_connected_hint')}</div>
        </section>
      );
    }
    if (!canSend) return null;
    const options = activeLabs(labs.data?.labs).map((l) => ({ value: l.id, label: l.name }));
    return (
      <section className={classes.card} aria-labelledby="hub-h">
        <h3 id="hub-h" className={classes.cardTitle}>
          {t('labHubClinic.send_title')}
        </h3>
        {options.length === 0 && !labs.isLoading ? (
          <div className={classes.hint}>{t('labHubClinic.no_active_labs')}</div>
        ) : (
          <Stack gap="sm">
            <Select
              label={t('labHubClinic.choose_lab')}
              data={options}
              value={labId}
              onChange={setLabId}
              allowDeselect={false}
            />
            <Button
              disabled={!labId}
              loading={send.isPending}
              onClick={() =>
                labId &&
                send.mutate(
                  { labOrderId: order.id, labId },
                  {
                    onSuccess: () => notifications.show({ message: t('labHubClinic.sent_toast') }),
                    onError: (err) => notifications.show({ color: 'red', message: errText(err) }),
                  },
                )
              }
            >
              {t('labHubClinic.send_btn')}
            </Button>
          </Stack>
        )}
      </section>
    );
  }

  const hubStatus = order.hubStatus ?? null;
  const sync = order.hubSyncStatus ?? null;
  const proposed = order.proposedPrice ?? null;
  const approved = order.approvedPrice ?? null;
  const list = messages.data ?? [];

  return (
    <section className={classes.card} aria-labelledby="hub-h" data-testid="lab-hub-panel">
      <h3 id="hub-h" className={classes.cardTitle}>
        {t('labHubClinic.hub_section')}
      </h3>
      <Stack gap="md">
        <Group gap="xs">
          {sync && (
            <StatusPill status={SYNC_TONE[sync] ?? 'planned'}>
              {t(`labHubClinic.sync_${sync}`)}
            </StatusPill>
          )}
          {hubStatus && (
            <StatusPill status={HUB_TONE[hubStatus] ?? 'planned'}>
              {t(`labHubClinic.hub_status_${hubStatus}`, hubStatus)}
            </StatusPill>
          )}
        </Group>
        {sync === 'pending' && (
          <div className={classes.hint}>{t('labHubClinic.sync_pending_hint')}</div>
        )}
        {hubStatus === 'rejected' && order.hubRejectReason && (
          <AlertBanner tier={2} title={t('labHubClinic.reject_reason')}>
            {order.hubRejectReason}
          </AlertBanner>
        )}

        <div>
          <div className={classes.label}>{t('labHubClinic.price_title')}</div>
          {approved ? (
            <div>
              <b>{formatCurrency(Number(approved), t)}</b>{' '}
              <span className={classes.okNote}>{t('labHubClinic.price_approved_note')}</span>
            </div>
          ) : proposed ? (
            <Group gap="sm">
              <span>
                {t('labHubClinic.price_proposed')}: <b>{formatCurrency(Number(proposed), t)}</b>
              </span>
              {canManage && (
                <Button
                  loading={approve.isPending}
                  onClick={() =>
                    approve.mutate(proposed, {
                      onSuccess: () =>
                        notifications.show({ message: t('labHubClinic.approved_toast') }),
                      onError: (err) => notifications.show({ color: 'red', message: errText(err) }),
                    })
                  }
                >
                  {t('labHubClinic.approve')}
                </Button>
              )}
            </Group>
          ) : (
            <div className={classes.hint}>{t('labHubClinic.price_none')}</div>
          )}
        </div>

        <div>
          <div className={classes.label}>{t('labHubClinic.messages_title')}</div>
          {list.length === 0 ? (
            <div className={classes.hint}>{t('labHubClinic.messages_empty')}</div>
          ) : (
            <ol
              aria-label={t('labHubClinic.messages_title')}
              style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}
            >
              {list.map((m) => (
                <li
                  key={m.id}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: m.author === 'lab' ? 'var(--surface-2)' : 'var(--primary-soft)',
                    justifySelf: m.author === 'lab' ? 'start' : 'end',
                    maxWidth: '85%',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                    {m.authorName ??
                      t(
                        m.author === 'lab'
                          ? 'labHubClinic.author_lab'
                          : 'labHubClinic.author_clinic',
                      )}
                    {!m.synced && ` · ${t('labHubClinic.msg_pending')}`}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {m.kind === 'file'
                      ? t('labHubClinic.file_from_lab', { name: m.body ?? m.file?.fileName ?? '' })
                      : m.body}
                  </div>
                </li>
              ))}
            </ol>
          )}
          {canManage && (
            <Stack gap="xs" mt="sm">
              <Textarea
                aria-label={t('labHubClinic.message_placeholder')}
                placeholder={t('labHubClinic.message_placeholder')}
                autosize
                minRows={2}
                value={draft}
                onChange={(e) => setDraft(e.currentTarget.value)}
              />
              <Group justify="flex-end">
                <Button
                  variant="default"
                  disabled={!draft.trim()}
                  loading={post.isPending}
                  onClick={() =>
                    post.mutate(draft.trim(), {
                      onSuccess: () => setDraft(''),
                      onError: (err) => notifications.show({ color: 'red', message: errText(err) }),
                    })
                  }
                >
                  {t('labHubClinic.send_message')}
                </Button>
              </Group>
            </Stack>
          )}
        </div>
      </Stack>
    </section>
  );
}
