import { Mono, PageHead, StateView, StatusPill } from '@dental/ui';
import { Button, Group, Table, Text } from '@mantine/core';
import { IconCalendarPlus, IconPhoneCheck, IconX } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useMarkRecallContacted, useRecalls, useUpdateRecall } from '../recalls.api';
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

export function RecallDashboard() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('recall.manage');
  const canViewPii = hasPermission('patient.view_pii');

  // "Bugun" — klinika-local (Asia/Tashkent). Backend `date` bersa shu kungacha
  // muddati keluvchi pending recall'lar qaytadi.
  const today = useMemo(() => localToday(), []);
  const recallsQuery = useRecalls({ date: today });

  const markContacted = useMarkRecallContacted();
  const updateRecall = useUpdateRecall();

  const rows = recallsQuery.data ?? [];

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
      {recallsQuery.isLoading ? (
        <StateView status="loading" skeleton="table" />
      ) : rows.length === 0 ? (
        <StateView status="empty" title={t('recall.empty')} />
      ) : (
        <Table.ScrollContainer minWidth={680} mt="md">
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('recall.col.patient')}</Table.Th>
                <Table.Th>{t('recall.col.phone')}</Table.Th>
                <Table.Th>{t('recall.col.reason')}</Table.Th>
                <Table.Th>{t('recall.col.due')}</Table.Th>
                <Table.Th>{t('recall.col.status')}</Table.Th>
                {canManage && <Table.Th>{t('recall.col.actions')}</Table.Th>}
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
                    <Text c={isOverdue(r.dueDate, today) ? 'red' : undefined}>{r.dueDate}</Text>
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
                          variant="light"
                          leftSection={<IconPhoneCheck size={14} />}
                          loading={markContacted.isPending}
                          onClick={() => markContacted.mutate({ id: r.id })}
                        >
                          {t('recall.action.contacted')}
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="light"
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
