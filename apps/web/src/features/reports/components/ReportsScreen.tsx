import { StateView } from '@dental/ui';
import {
  Button,
  Card,
  Container,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconFileSpreadsheet, IconFileTypeCsv } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBranches } from '@/features/queue/queue.api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useAppointmentStats,
  useDoctorWorkload,
  usePlanCompletion,
  useRevenueReport,
} from '../reports.api';
import {
  appointmentsToRows,
  doctorsToRows,
  downloadCsv,
  downloadXlsx,
  planCompletionToRows,
  revenueToRows,
} from '../reports.export';
import type { ReportRange } from '../reports.types';
import { BarMini } from './BarMini';

// Local (Tashkent) sana -> YYYY-MM-DD; toISOString UTC siljishidan qochish.
const toLocalDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const defaultRange = (): [Date, Date] => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29); // oxirgi 30 kun (bugun bilan)
  return [from, to];
};

type SectionProps = {
  title: string;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  onCsv: () => void;
  onXlsx: () => void;
  exportLabel: { csv: string; xlsx: string };
  children: React.ReactNode;
  hasData: boolean;
  emptyText: string;
  statesLabels: { errorTitle: string; retry: string; emptyTitle: string };
};

function ReportSection({
  title,
  loading,
  error,
  onRetry,
  onCsv,
  onXlsx,
  exportLabel,
  children,
  hasData,
  emptyText,
  statesLabels,
}: SectionProps) {
  return (
    <Card withBorder padding="lg">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={4}>{title}</Title>
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconFileTypeCsv size={16} />}
              onClick={onCsv}
              disabled={!hasData}
            >
              {exportLabel.csv}
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconFileSpreadsheet size={16} />}
              onClick={onXlsx}
              disabled={!hasData}
            >
              {exportLabel.xlsx}
            </Button>
          </Group>
        </Group>
        {loading ? (
          <StateView status="loading" skeleton="cards" />
        ) : error ? (
          <StateView
            status="error"
            title={statesLabels.errorTitle}
            retryLabel={statesLabels.retry}
            onRetry={onRetry}
          />
        ) : hasData ? (
          children
        ) : (
          <StateView status="empty" title={statesLabels.emptyTitle} description={emptyText} />
        )}
      </Stack>
    </Card>
  );
}

export function ReportsScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const [[from, to], setDates] = useState<[Date | null, Date | null]>(defaultRange());
  const [branchId, setBranchId] = useState<string | null>(null);

  const branches = useBranches();
  const canFilterBranch = hasPermission('report.view'); // Owner/Menejer-level

  const range: ReportRange = useMemo(
    () => ({
      from: toLocalDate(from ?? defaultRange()[0]),
      to: toLocalDate(to ?? defaultRange()[1]),
      branchId: branchId || undefined,
    }),
    [from, to, branchId],
  );

  const revenue = useRevenueReport(range);
  const appointments = useAppointmentStats(range);
  const doctors = useDoctorWorkload(range);
  const plans = usePlanCompletion(range);

  const fmt = (n: number) => new Intl.NumberFormat('uz-UZ').format(n);
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const exportLabel = {
    csv: t('reports.export_csv', { defaultValue: 'CSV' }),
    xlsx: t('reports.export_excel', { defaultValue: 'Excel' }),
  };
  const statesLabels = {
    errorTitle: t('states.error_title'),
    retry: t('states.retry'),
    emptyTitle: t('states.empty_title'),
  };
  const suffix = `${range.from}_${range.to}`;

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Title order={2}>{t('reports.title', { defaultValue: 'Hisobotlar' })}</Title>

        <Card withBorder padding="md">
          <Group align="end" gap="md">
            <DatePickerInput
              type="range"
              label={t('reports.date_range', { defaultValue: 'Sana oralig‘i' })}
              value={[from, to]}
              onChange={(val) => setDates(val)}
              valueFormat="DD.MM.YYYY"
              style={{ minWidth: 260 }}
              allowSingleDateInRange
            />
            {canFilterBranch && (
              <Select
                label={t('reports.branch', { defaultValue: 'Filial' })}
                placeholder={t('reports.all_branches', { defaultValue: 'Barcha filiallar' })}
                clearable
                value={branchId}
                onChange={setBranchId}
                data={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
                style={{ minWidth: 220 }}
              />
            )}
          </Group>
        </Card>

        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          {/* Daromad */}
          <ReportSection
            title={t('reports.revenue', { defaultValue: 'Daromad' })}
            loading={revenue.isLoading}
            error={revenue.isError}
            onRetry={() => revenue.refetch()}
            statesLabels={statesLabels}
            hasData={!!revenue.data}
            emptyText={t('reports.empty', { defaultValue: 'Ma’lumot yo‘q' })}
            onCsv={() =>
              revenue.data && downloadCsv(revenueToRows(revenue.data), `daromad_${suffix}`)
            }
            onXlsx={() =>
              revenue.data && downloadXlsx(revenueToRows(revenue.data), `daromad_${suffix}`)
            }
            exportLabel={exportLabel}
          >
            {revenue.data && (
              <Stack gap="md">
                <Text fw={600}>
                  {t('reports.total', { defaultValue: 'Jami' })}: {fmt(revenue.data.total)}{' '}
                  {t('reports.currency', { defaultValue: 'so‘m' })}
                </Text>
                {revenue.data.byService.length > 0 && (
                  <BarMini
                    data={revenue.data.byService.map((s) => ({
                      label: s.serviceName,
                      value: s.total,
                    }))}
                  />
                )}
              </Stack>
            )}
          </ReportSection>

          {/* Qabullar */}
          <ReportSection
            title={t('reports.appointments', { defaultValue: 'Qabullar' })}
            loading={appointments.isLoading}
            error={appointments.isError}
            onRetry={() => appointments.refetch()}
            statesLabels={statesLabels}
            hasData={!!appointments.data}
            emptyText={t('reports.empty', { defaultValue: 'Ma’lumot yo‘q' })}
            onCsv={() =>
              appointments.data &&
              downloadCsv(appointmentsToRows(appointments.data), `qabullar_${suffix}`)
            }
            onXlsx={() =>
              appointments.data &&
              downloadXlsx(appointmentsToRows(appointments.data), `qabullar_${suffix}`)
            }
            exportLabel={exportLabel}
          >
            {appointments.data && (
              <Stack gap="xs">
                <Group gap="xl">
                  <Text>
                    {t('reports.total', { defaultValue: 'Jami' })}: {fmt(appointments.data.total)}
                  </Text>
                  <Text>
                    {t('reports.no_show', { defaultValue: 'Kelmaganlar' })}:{' '}
                    {pct(appointments.data.noShowRate)}
                  </Text>
                  <Text>
                    {t('reports.utilization', { defaultValue: 'Bandlik' })}:{' '}
                    {pct(appointments.data.slotUtilization)}
                  </Text>
                </Group>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('reports.status', { defaultValue: 'Status' })}</Table.Th>
                      <Table.Th>{t('reports.count', { defaultValue: 'Soni' })}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {appointments.data.byStatus.map((s) => (
                      <Table.Tr key={s.status}>
                        <Table.Td>{s.status}</Table.Td>
                        <Table.Td>{fmt(s.count)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Stack>
            )}
          </ReportSection>

          {/* Shifokorlar yuklamasi */}
          <ReportSection
            title={t('reports.doctor_workload', { defaultValue: 'Shifokorlar yuklamasi' })}
            loading={doctors.isLoading}
            error={doctors.isError}
            onRetry={() => doctors.refetch()}
            statesLabels={statesLabels}
            hasData={!!doctors.data && doctors.data.length > 0}
            emptyText={t('reports.empty', { defaultValue: 'Ma’lumot yo‘q' })}
            onCsv={() =>
              doctors.data && downloadCsv(doctorsToRows(doctors.data), `shifokorlar_${suffix}`)
            }
            onXlsx={() =>
              doctors.data && downloadXlsx(doctorsToRows(doctors.data), `shifokorlar_${suffix}`)
            }
            exportLabel={exportLabel}
          >
            {doctors.data && (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('reports.doctor', { defaultValue: 'Shifokor' })}</Table.Th>
                    <Table.Th>{t('reports.total', { defaultValue: 'Jami' })}</Table.Th>
                    <Table.Th>{t('reports.completed', { defaultValue: 'Yakunlangan' })}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {doctors.data.map((d) => (
                    <Table.Tr key={d.doctorId}>
                      <Table.Td>{d.doctorId}</Table.Td>
                      <Table.Td>{fmt(d.total)}</Table.Td>
                      <Table.Td>{fmt(d.completed)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </ReportSection>

          {/* Davolash rejalari */}
          <ReportSection
            title={t('reports.plan_completion', { defaultValue: 'Davolash rejalari' })}
            loading={plans.isLoading}
            error={plans.isError}
            onRetry={() => plans.refetch()}
            statesLabels={statesLabels}
            hasData={!!plans.data}
            emptyText={t('reports.empty', { defaultValue: 'Ma’lumot yo‘q' })}
            onCsv={() =>
              plans.data && downloadCsv(planCompletionToRows(plans.data), `rejalar_${suffix}`)
            }
            onXlsx={() =>
              plans.data && downloadXlsx(planCompletionToRows(plans.data), `rejalar_${suffix}`)
            }
            exportLabel={exportLabel}
          >
            {plans.data && (
              <Stack gap="xs">
                <Group gap="xl">
                  <Text>
                    {t('reports.total_stages', { defaultValue: 'Bosqichlar' })}:{' '}
                    {fmt(plans.data.totalStages)}
                  </Text>
                  <Text>
                    {t('reports.completed', { defaultValue: 'Yakunlangan' })}:{' '}
                    {fmt(plans.data.completedStages)}
                  </Text>
                  <Text>
                    {t('reports.rate', { defaultValue: 'Bajarilish' })}: {pct(plans.data.rate)}
                  </Text>
                </Group>
                {plans.data.byStatus.length > 0 && (
                  <BarMini
                    data={plans.data.byStatus.map((s) => ({ label: s.status, value: s.count }))}
                  />
                )}
              </Stack>
            )}
          </ReportSection>
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
