import { PageHead, StateView, StatusPill } from '@dental/ui';
import { Alert, Button, Card, Group, Modal, Stack, Table, Text, Title } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useCreateRun,
  useFinalizeRun,
  usePayrollAdjustments,
  usePayrollRun,
  usePayrollRuns,
  useStaffNames,
} from '../payroll.api';
import {
  summarizeAdjustments,
  toLocalDate,
  toPayrollLineVM,
  toPayrollRunVM,
} from '../payroll.mappers';
import { periodFormSchema } from '../payroll.schema';

export function PayrollScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('payroll.manage');

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const runs = usePayrollRuns();
  const runDetail = usePayrollRun(selectedRunId);
  const adjustments = usePayrollAdjustments(selectedRunId);
  const adjByUser = useMemo(() => summarizeAdjustments(adjustments.data ?? []), [adjustments.data]);
  const createRun = useCreateRun();
  const finalizeRun = useFinalizeRun();

  // Xodim nomlarini yechish uchun (line faqat userId tashiydi). CLI-470:
  // `payroll.view`-gated (`fullName` backendda allaqachon resolve qilingan).
  const staffNames = useStaffNames();
  const nameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of staffNames.data ?? []) {
      map.set(s.userId, s.fullName);
    }
    return map;
  }, [staffNames.data]);

  const form = useForm<{ period: [Date | null, Date | null] }>({
    initialValues: { period: [null, null] },
    validate: zod4Resolver(periodFormSchema),
  });

  const handleCreate = form.onSubmit((values) => {
    const [from, to] = values.period;
    if (!from || !to) return;
    createRun.mutate(
      { periodFrom: toLocalDate(from), periodTo: toLocalDate(to) },
      {
        onSuccess: (run) => {
          setSelectedRunId(run.id);
          form.reset();
        },
      },
    );
  });

  const runRows = (runs.data ?? []).map(toPayrollRunVM);
  const lineVMs = (runDetail.data?.lines ?? []).map((l) => toPayrollLineVM(l, nameByUserId));
  const detailStatus = runDetail.data?.status;
  const grandTotal = lineVMs.reduce((sum, l) => sum + l.total, 0);

  const statusBadge = (status: 'draft' | 'finalized') => (
    <StatusPill status={status === 'finalized' ? 'success' : 'neutral'}>
      {t(`payroll.status_label.${status}`)}
    </StatusPill>
  );

  return (
    <Stack gap="lg">
      <PageHead title={t('payroll.title')} />

      {/* Davr tanlash + run yaratish */}
      {canManage && (
        <Card withBorder padding="md">
          <form onSubmit={handleCreate}>
            <Group align="end" gap="md">
              <DatePickerInput
                type="range"
                label={t('payroll.period')}
                placeholder={t('payroll.period_placeholder')}
                valueFormat="DD.MM.YYYY"
                style={{ minWidth: 280 }}
                allowSingleDateInRange
                {...form.getInputProps('period')}
              />
              <Button type="submit" loading={createRun.isPending}>
                {t('payroll.create_run')}
              </Button>
            </Group>
          </form>
        </Card>
      )}

      {/* Run ro'yxati */}
      <Card withBorder padding="lg">
        <Stack gap="md">
          <Title order={4}>{t('payroll.runs')}</Title>
          {runs.isError ? (
            <StateView
              status="error"
              title={t('states.error_title')}
              retryLabel={t('states.retry')}
              onRetry={() => runs.refetch()}
            />
          ) : runs.isLoading ? (
            <StateView status="loading" skeleton="table" />
          ) : runRows.length === 0 ? (
            <StateView status="empty" title={t('payroll.no_runs')} />
          ) : (
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('payroll.period')}</Table.Th>
                  <Table.Th>{t('payroll.status')}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {runRows.map((r) => (
                  <Table.Tr
                    key={r.id}
                    bg={r.id === selectedRunId ? 'var(--primary-soft)' : undefined}
                  >
                    <Table.Td>
                      {r.periodFrom} — {r.periodTo}
                    </Table.Td>
                    <Table.Td>{statusBadge(r.status)}</Table.Td>
                    <Table.Td>
                      <Button size="xs" variant="subtle" onClick={() => setSelectedRunId(r.id)}>
                        {t('payroll.view_detail')}
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      </Card>

      {/* Run detali */}
      {selectedRunId && (
        <Card withBorder padding="lg">
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="sm">
                <Title order={4}>{t('payroll.detail')}</Title>
                {detailStatus && statusBadge(detailStatus)}
              </Group>
              {canManage && detailStatus === 'draft' && (
                <Button
                  color="teal"
                  loading={finalizeRun.isPending}
                  onClick={() => setConfirmOpen(true)}
                >
                  {t('payroll.finalize')}
                </Button>
              )}
            </Group>

            {runDetail.isError ? (
              <StateView
                status="error"
                title={t('states.error_title')}
                retryLabel={t('states.retry')}
                onRetry={() => runDetail.refetch()}
              />
            ) : runDetail.isLoading ? (
              <StateView status="loading" skeleton="table" />
            ) : lineVMs.length === 0 ? (
              <StateView status="empty" title={t('payroll.no_lines')} />
            ) : (
              <Table.ScrollContainer minWidth={800}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('payroll.employee')}</Table.Th>
                      <Table.Th ta="right">{t('payroll.base_salary')}</Table.Th>
                      <Table.Th ta="right">{t('payroll.attributed_revenue')}</Table.Th>
                      <Table.Th ta="right">{t('payroll.commission_percent')}</Table.Th>
                      <Table.Th ta="right">{t('payroll.commission_amount')}</Table.Th>
                      <Table.Th ta="right">{t('finance.adjustment')}</Table.Th>
                      <Table.Th ta="right">{t('payroll.total')}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {lineVMs.map((l) => (
                      <Table.Tr key={l.id}>
                        <Table.Td>{l.employeeName}</Table.Td>
                        <Table.Td ta="right">{formatCurrency(l.baseSalary, t)}</Table.Td>
                        <Table.Td ta="right">{formatCurrency(l.attributedRevenue, t)}</Table.Td>
                        <Table.Td ta="right">{l.commissionPercent}%</Table.Td>
                        <Table.Td ta="right">{formatCurrency(l.commissionAmount, t)}</Table.Td>
                        <Table.Td ta="right" data-testid={`adj-${l.userId}`}>
                          {l.userId && adjByUser.get(l.userId) ? (
                            <Stack gap={0} align="flex-end">
                              <Text size="sm" fw={700} c="var(--danger)">
                                {formatCurrency(adjByUser.get(l.userId)?.total ?? 0, t)}
                              </Text>
                              {adjByUser.get(l.userId)?.items.map((it) => (
                                <Text key={`${it.receiptNumber}-${it.date}`} size="xs" c="dimmed">
                                  {t('finance.adjReason', {
                                    date: it.date,
                                    receipt: it.receiptNumber ?? '—',
                                  })}
                                </Text>
                              ))}
                            </Stack>
                          ) : (
                            <Text size="sm" c="dimmed">
                              —
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td ta="right" fw={600}>
                          {formatCurrency(l.total, t)}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
            {lineVMs.length > 0 && (
              <Group justify="space-between">
                <Text size="xs" c="dimmed">
                  {t('finance.finalizeNote')}
                </Text>
                <Text fw={700} data-testid="payroll-grand-total">
                  {formatCurrency(grandTotal, t)}
                </Text>
              </Group>
            )}
          </Stack>
        </Card>
      )}

      <Modal
        opened={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('finance.finalizeTitle')}
        size="md"
      >
        <Stack gap="md">
          <Alert color="yellow" variant="light">
            {t('finance.finalizeWarn')}
          </Alert>
          <Text size="sm">
            {t('finance.finalizeTotal', { total: formatCurrency(grandTotal, t) })}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              color="teal"
              loading={finalizeRun.isPending}
              onClick={() => {
                if (selectedRunId) finalizeRun.mutate(selectedRunId);
                setConfirmOpen(false);
              }}
            >
              {t('finance.finalizeConfirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
