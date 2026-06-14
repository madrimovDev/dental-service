import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
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
  usePayrollRun,
  usePayrollRuns,
  useUserAssignments,
} from '../payroll.api';
import { toLocalDate, toPayrollLineVM, toPayrollRunVM } from '../payroll.mappers';
import { periodFormSchema } from '../payroll.schema';

export function PayrollScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('payroll.manage');

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const runs = usePayrollRuns();
  const runDetail = usePayrollRun(selectedRunId);
  const createRun = useCreateRun();
  const finalizeRun = useFinalizeRun();

  // Xodim nomlarini yechish uchun (line faqat userId tashiydi).
  const assignments = useUserAssignments();
  const nameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments.data ?? []) {
      if (a.userFullName) map.set(a.userId, a.userFullName);
      else map.set(a.userId, a.userPhone);
    }
    return map;
  }, [assignments.data]);

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

  const statusBadge = (status: 'draft' | 'finalized') => (
    <Badge color={status === 'finalized' ? 'green' : 'gray'} variant="light">
      {t(`payroll.status_label.${status}`)}
    </Badge>
  );

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Title order={2}>{t('payroll.title')}</Title>

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
            {runs.isLoading ? (
              <Group justify="center" py="md">
                <Loader size="sm" />
              </Group>
            ) : runRows.length === 0 ? (
              <Text c="dimmed" size="sm">
                {t('payroll.no_runs')}
              </Text>
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
                      bg={r.id === selectedRunId ? 'var(--mantine-color-blue-light)' : undefined}
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
                    color="green"
                    loading={finalizeRun.isPending}
                    onClick={() => finalizeRun.mutate(selectedRunId)}
                  >
                    {t('payroll.finalize')}
                  </Button>
                )}
              </Group>

              {runDetail.isLoading ? (
                <Group justify="center" py="md">
                  <Loader size="sm" />
                </Group>
              ) : lineVMs.length === 0 ? (
                <Text c="dimmed" size="sm">
                  {t('payroll.no_lines')}
                </Text>
              ) : (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('payroll.employee')}</Table.Th>
                      <Table.Th ta="right">{t('payroll.base_salary')}</Table.Th>
                      <Table.Th ta="right">{t('payroll.attributed_revenue')}</Table.Th>
                      <Table.Th ta="right">{t('payroll.commission_percent')}</Table.Th>
                      <Table.Th ta="right">{t('payroll.commission_amount')}</Table.Th>
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
                        <Table.Td ta="right" fw={600}>
                          {formatCurrency(l.total, t)}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Stack>
          </Card>
        )}
      </Stack>
    </Container>
  );
}
