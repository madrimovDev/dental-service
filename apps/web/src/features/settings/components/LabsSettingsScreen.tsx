import { AlertBanner, StateView, StatusPill } from '@dental/ui';
import { Button, Group, Stack, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type LabHubLabRecord,
  useConnectLabHub,
  useLabHubLabs,
  useLabHubStatus,
  useRequestLabLink,
} from '@/features/clinical/components/lab-orders/lab-hub.api';
import { useAuthStore } from '@/stores/auth-store.ts';
import { SettingsShell } from './SettingsShell';

const CARD_STYLE: React.CSSProperties = {
  borderRadius: 'var(--radius-card)',
  padding: 20,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-sm)',
};

const LINK_TONE: Record<string, 'planned' | 'confirmed' | 'waiting' | 'failed'> = {
  active: 'confirmed',
  pending: 'waiting',
  rejected: 'failed',
  revoked: 'failed',
};

const fmtTime = (iso: string | null, lang: string) =>
  iso
    ? new Date(iso).toLocaleString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

/**
 * Sozlamalar → «Laboratoriyalar» (Lab Hub, W2): portalga ulanish (desktop — litsenziya,
 * SaaS — klinika obunasi), ochiq lablar katalogi va ulanish so'rovi (L5), sinxron holati.
 * Ulanish va so'rov — `tenant_settings.edit`; ko'rish — `lab_order.view`.
 */
export function LabsSettingsScreen() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canView = hasPermission('lab_order.view');
  const canEdit = hasPermission('tenant_settings.edit');

  const status = useLabHubStatus({ enabled: canView });
  const connected = status.data?.connected === true;
  const labs = useLabHubLabs({ enabled: canView && connected });
  // QA: katalog uzun bo'lsa qidiruv (nom/shahar); ulangan va so'ralgan lablar tepada.
  const [catalogQuery, setCatalogQuery] = useState('');
  const q = catalogQuery.trim().toLowerCase();
  const visibleLabs = (labs.data?.labs ?? [])
    .filter((l) => !q || `${l.name} ${l.city ?? ''}`.toLowerCase().includes(q))
    .sort((x, y) => Number(!x.linkStatus) - Number(!y.linkStatus));
  const connect = useConnectLabHub();
  const request = useRequestLabLink();

  const errorText = (err: unknown) => {
    const code = (err as { code?: string } | null)?.code ?? '';
    return t(`labHubClinic.err_${code.replace(/\./g, '_')}`, t('labHubClinic.err_generic'));
  };

  const onConnect = () =>
    connect.mutate(undefined, {
      onSuccess: () => notifications.show({ message: t('labHubClinic.connected_toast') }),
      onError: (err) => notifications.show({ color: 'red', message: errorText(err) }),
    });

  const onRequest = (lab: LabHubLabRecord) =>
    request.mutate(lab.id, {
      onSuccess: () => notifications.show({ message: t('labHubClinic.requested_toast') }),
      onError: (err) => notifications.show({ color: 'red', message: errorText(err) }),
    });

  if (!canView) {
    return (
      <SettingsShell active="labs">
        <StateView status="forbidden" title={t('states.forbidden_title')} />
      </SettingsShell>
    );
  }

  const s = status.data;
  return (
    <SettingsShell active="labs">
      {status.isError ? (
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => status.refetch()}
        />
      ) : !s ? (
        <StateView status="loading" skeleton="cards" />
      ) : (
        <Stack gap="md" maw={760}>
          <section aria-labelledby="lh-conn" style={CARD_STYLE}>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <h2 id="lh-conn" style={{ margin: 0, fontSize: 18 }}>
                  {t('labHubClinic.title')}
                </h2>
                <p style={{ margin: '6px 0 0', color: 'var(--ink-2)', maxWidth: 520 }}>
                  {t('labHubClinic.intro')}
                </p>
              </div>
              <StatusPill status={connected ? 'confirmed' : 'planned'}>
                {t(
                  connected ? 'labHubClinic.status_connected' : 'labHubClinic.status_disconnected',
                )}
              </StatusPill>
            </Group>

            {!s.configured && (
              <div style={{ marginTop: 14 }}>
                <AlertBanner tier={2}>{t('labHubClinic.not_configured')}</AlertBanner>
              </div>
            )}

            {connected && (
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'max-content 1fr',
                  gap: '8px 16px',
                  margin: '16px 0 0',
                }}
              >
                <dt style={{ color: 'var(--ink-2)' }}>{t('labHubClinic.last_sync')}</dt>
                <dd style={{ margin: 0, fontWeight: 600 }}>
                  {fmtTime(s.lastPollAt, i18n.language) ?? t('labHubClinic.never')}
                </dd>
                <dt style={{ color: 'var(--ink-2)' }}>{t('labHubClinic.queue')}</dt>
                <dd style={{ margin: 0, fontWeight: 600 }}>
                  {t('labHubClinic.queue_value', {
                    pending: s.pendingOutbox,
                    failed: s.failedOutbox,
                  })}
                </dd>
                {s.lastError && (
                  <>
                    <dt style={{ color: 'var(--ink-2)' }}>{t('labHubClinic.last_error')}</dt>
                    <dd style={{ margin: 0, color: 'var(--warning)' }}>
                      {t(
                        `labHubClinic.err_${s.lastError.replace(/\./g, '_')}`,
                        t('labHubClinic.err_generic'),
                      )}
                    </dd>
                  </>
                )}
              </dl>
            )}

            {canEdit && s.configured && (
              <Group mt="md" gap="sm">
                <Button onClick={onConnect} loading={connect.isPending}>
                  {t(connected ? 'labHubClinic.reconnect' : 'labHubClinic.connect')}
                </Button>
                <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>
                  {t(
                    s.mode === 'desktop'
                      ? 'labHubClinic.connect_hint_desktop'
                      : 'labHubClinic.connect_hint_saas',
                  )}
                </span>
              </Group>
            )}
          </section>

          {connected && (
            <section aria-labelledby="lh-cat" style={CARD_STYLE}>
              <h2 id="lh-cat" style={{ margin: '0 0 12px', fontSize: 18 }}>
                {t('labHubClinic.catalog_title')}
              </h2>
              {labs.data?.stale && (
                <div style={{ marginBottom: 12 }}>
                  <AlertBanner tier={3}>{t('labHubClinic.catalog_stale')}</AlertBanner>
                </div>
              )}
              <TextInput
                mb="md"
                aria-label={t('labHubClinic.catalog_search')}
                placeholder={t('labHubClinic.catalog_search')}
                value={catalogQuery}
                onChange={(e) => setCatalogQuery(e.currentTarget.value)}
              />
              {labs.isError ? (
                <StateView
                  status="error"
                  title={t('states.error_title')}
                  retryLabel={t('states.retry')}
                  onRetry={() => labs.refetch()}
                />
              ) : !labs.data ? (
                <StateView status="loading" skeleton="table" />
              ) : visibleLabs.length === 0 ? (
                <StateView status="empty" title={t('labHubClinic.catalog_empty')} />
              ) : (
                <ul
                  aria-label={t('labHubClinic.catalog_title')}
                  style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}
                >
                  {visibleLabs.map((lab) => {
                    const st = lab.linkStatus ?? 'none';
                    const canRequest =
                      canEdit && (st === 'none' || st === 'rejected' || st === 'revoked');
                    return (
                      <li
                        key={lab.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 14px',
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          minHeight: 44,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700 }}>{lab.name}</div>
                          <div style={{ color: 'var(--ink-2)', fontSize: 13 }}>
                            {[lab.city, lab.description].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        {st !== 'none' && (
                          <StatusPill status={LINK_TONE[st] ?? 'planned'}>
                            {t(`labHubClinic.link_${st}`, st)}
                          </StatusPill>
                        )}
                        {canRequest && (
                          <Button
                            variant="default"
                            onClick={() => onRequest(lab)}
                            loading={request.isPending && request.variables === lab.id}
                          >
                            {t(
                              st === 'none' ? 'labHubClinic.request' : 'labHubClinic.request_again',
                            )}
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </Stack>
      )}
    </SettingsShell>
  );
}
