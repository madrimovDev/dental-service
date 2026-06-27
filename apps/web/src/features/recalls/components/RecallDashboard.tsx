import { Mono, PageHead, StateView, StatusPill } from '@dental/ui';
import { Box, Button, Group, Table, Text } from '@mantine/core';
import { IconCalendarPlus, IconPhoneCheck, IconX } from '@tabler/icons-react';
import type { CSSProperties } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { StatCard } from '@/features/dashboard/components/widgets/StatCard.tsx';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useMarkRecallContacted,
  useRecallSummary,
  useRecalls,
  useUpdateRecall,
} from '../recalls.api';
import {
  isOverdue,
  localToday,
  recallReasonLabelKey,
  recallStatusLabelKey,
} from '../recalls.mappers';
import type { RecallDto } from '../recalls.types';

/** Recall status → StatusPill toni (vizual semantika). */
function statusTone(status: RecallDto['status']): 'neutral' | 'warning' | 'success' | 'info' {
  switch (status) {
    case 'contacted':
      return 'info';
    case 'scheduled':
      return 'success';
    case 'pending':
      return 'warning';
    default:
      return 'neutral';
  }
}

/**
 * Muddat (due) chip toni — FAQAT mavjud maydonlardan (yangi maydon/kalit yo'q):
 * muddati o'tgan → warning, bugun → accent, kelajak → neutral.
 */
function dueTone(dueDate: string, today: string): 'warning' | 'accent' | 'neutral' {
  if (isOverdue(dueDate, today)) return 'warning';
  if (dueDate === today) return 'accent';
  return 'neutral';
}

// Dental OS chrome — token-driven inline stillar (yangi CSS fayl yo'q, scope=1 fayl).
const headStripStyle: CSSProperties = { background: 'var(--surface-2)' };
const thLabelStyle: CSSProperties = {
  color: 'var(--ink-3)',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--fw-semibold)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

export function RecallDashboard() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('recall.manage');
  const canViewPii = hasPermission('patient.view_pii');

  // "Bugun" — klinika-local (Asia/Tashkent). Backend `date` bersa shu kungacha
  // muddati keluvchi pending recall'lar qaytadi.
  const today = useMemo(() => localToday(), []);
  const recallsQuery = useRecalls({ date: today });
  const summaryQuery = useRecallSummary();

  const markContacted = useMarkRecallContacted();
  const updateRecall = useUpdateRecall();

  const rows = recallsQuery.data ?? [];
  const kpi = summaryQuery.data;

  if (recallsQuery.isError) {
    return (
      <div>
        <PageHead title={t('recall.title')} />
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => recallsQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHead title={t('recall.title')} subtitle={t('recall.due_today')} />

      {/* 4-KPI grid: pending / contacted / scheduled / overdue + efficacyPct hint */}
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
          marginTop: 16,
          marginBottom: 20,
        }}
      >
        <StatCard
          label={t('recall.kpi.pending')}
          value={kpi ? String(kpi.pending) : '—'}
          tone="warning"
        />
        <StatCard
          label={t('recall.kpi.contacted')}
          value={kpi ? String(kpi.contacted) : '—'}
          tone="info"
        />
        <StatCard
          label={t('recall.kpi.scheduled')}
          value={kpi ? String(kpi.scheduled) : '—'}
          tone="primary"
        />
        <StatCard
          label={t('recall.kpi.overdue')}
          value={kpi ? String(kpi.overdue) : '—'}
          tone="warning"
          hint={kpi ? `${t('recall.kpi.efficacy')}: ${Math.round(kpi.efficacyPct)}%` : undefined}
        />
      </Box>
      {recallsQuery.isLoading ? (
        <StateView status="loading" skeleton="table" />
      ) : rows.length === 0 ? (
        <StateView status="empty" title={t('recall.empty')} />
      ) : (
        <Table.ScrollContainer minWidth={680} mt="md">
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead style={headStripStyle}>
              <Table.Tr>
                <Table.Th style={thLabelStyle}>{t('recall.col.patient')}</Table.Th>
                <Table.Th style={thLabelStyle}>{t('recall.col.phone')}</Table.Th>
                <Table.Th style={thLabelStyle}>{t('recall.col.reason')}</Table.Th>
                <Table.Th style={thLabelStyle}>{t('recall.col.due')}</Table.Th>
                <Table.Th style={thLabelStyle}>{t('recall.col.status')}</Table.Th>
                {canManage && <Table.Th style={thLabelStyle}>{t('recall.col.actions')}</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td>
                    <Link to={`/patients/${r.patientId}`}>{r.patientName}</Link>
                  </Table.Td>
                  <Table.Td>
                    {canViewPii && r.patientPhone ? (
                      <Mono>{r.patientPhone}</Mono>
                    ) : (
                      <Text c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>{t(recallReasonLabelKey(r.reason))}</Table.Td>
                  <Table.Td>
                    <StatusPill status={dueTone(r.dueDate, today)} dot={false}>
                      <Mono>{r.dueDate}</Mono>
                    </StatusPill>
                  </Table.Td>
                  <Table.Td>
                    <StatusPill status={statusTone(r.status)}>
                      {t(recallStatusLabelKey(r.status))}
                    </StatusPill>
                  </Table.Td>
                  {canManage && (
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Button
                          size="compact-xs"
                          variant="default"
                          leftSection={<IconPhoneCheck size={14} />}
                          loading={markContacted.isPending}
                          onClick={() => markContacted.mutate({ id: r.id })}
                        >
                          {t('recall.action.contacted')}
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="filled"
                          color="teal"
                          component={Link}
                          to={`/appointments?patientId=${r.patientId}`}
                          leftSection={<IconCalendarPlus size={14} />}
                        >
                          {t('recall.action.schedule')}
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          color="red"
                          leftSection={<IconX size={14} />}
                          loading={updateRecall.isPending}
                          onClick={() =>
                            updateRecall.mutate({ id: r.id, body: { status: 'dismissed' } })
                          }
                        >
                          {t('recall.action.dismiss')}
                        </Button>
                      </Group>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </div>
  );
}
