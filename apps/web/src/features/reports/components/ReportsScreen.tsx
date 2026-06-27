import { PageHead, StatCard, StateView } from '@dental/ui';
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
import {
  IconCalendarStats,
  IconCashBanknote,
  IconChartBar,
  IconFileSpreadsheet,
  IconFileTypeCsv,
  IconUserOff,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDoctors } from '@/features/appointments/appointments.api';
import { Donut } from '@/features/dashboard/components/widgets/Donut';
import { Heatmap } from '@/features/dashboard/components/widgets/Heatmap';
import { useBranches } from '@/features/queue/queue.api.ts';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useAppointmentStats,
  useDentalAnalytics,
  useDoctorWorkload,
  useOneCExport,
  usePlanCompletion,
  useRevenueReport,
} from '../reports.api';
import {
  appointmentsToRows,
  doctorsToRows,
  download1C,
  downloadCsv,
  downloadXlsx,
  oneCToRows,
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
  const analytics = useDentalAnalytics(range);
  const oneC = useOneCExport(range);

  const WEEKDAY_LABELS = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];

  const handle1CExport = async () => {
    const { data } = await oneC.refetch();
    if (data) download1C(oneCToRows(data), `1c_export_${range.from}_${range.to}`);
  };

  // doctorId → ism (workload jadvali xom UUID o'rniga ism ko'rsatadi; CSV/XLSX ham)
  const doctorList = useDoctors();
  const doctorName = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of doctorList.data ?? []) map.set(d.id, d.name);
    return (id: string) => map.get(id) ?? id.slice(0, 8);
  }, [doctorList.data]);

  const fmt = (n: number) => formatNumber(n);
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const methodColor = (m: string) =>
    m === 'cash'
      ? 'var(--success)'
      : m === 'card'
        ? 'var(--info)'
        : m === 'transfer'
          ? 'var(--violet)'
          : 'var(--ink-3)';
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
        <PageHead title={t('reports.title', { defaultValue: 'Hisobotlar' })} />

        {/* 4 KPI — har biri o'z hook'iga bog'liq; ma'lumot yo'q bo'lsa em-dash (hech qachon bo'sh grid) */}
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
          <StatCard
            accent
            icon={<IconCashBanknote size={18} />}
            label={t('reports.revenue', { defaultValue: 'Daromad' })}
            value={revenue.data ? formatCurrency(revenue.data.total, t) : '—'}
          />
          <StatCard
            icon={<IconCalendarStats size={18} />}
            label={t('reports.appointments', { defaultValue: 'Qabullar' })}
            value={appointments.data ? formatNumber(appointments.data.total) : '—'}
          />
          <StatCard
            icon={<IconUserOff size={18} />}
            label={t('reports.no_show', { defaultValue: 'Kelmaganlar' })}
            value={appointments.data ? pct(appointments.data.noShowRate) : '—'}
          />
          <StatCard
            icon={<IconChartBar size={18} />}
            label={t('reports.utilization', { defaultValue: 'Bandlik' })}
            value={appointments.data ? pct(appointments.data.slotUtilization) : '—'}
          />
        </SimpleGrid>

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
            <Button
              variant="light"
              leftSection={<IconFileSpreadsheet size={16} />}
              loading={oneC.isFetching}
              onClick={handle1CExport}
            >
              {t('reports.export_1c', { defaultValue: '1C eksport' })}
            </Button>
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
                {revenue.data.byPeriod.length > 0 && (
                  <Stack gap="xs">
                    <Text fw={600}>
                      {t('reports.revenue_trend', { defaultValue: 'Daromad dinamikasi' })}
                    </Text>
                    <BarMini
                      data={revenue.data.byPeriod.map((p) => ({
                        label: p.date,
                        value: p.total,
                      }))}
                    />
                  </Stack>
                )}
                {revenue.data.byService.length > 0 && (
                  <Stack gap="xs">
                    <Text fw={600}>
                      {t('reports.top_services', { defaultValue: 'Eng ko‘p xizmatlar' })}
                    </Text>
                    <BarMini
                      data={revenue.data.byService.map((s) => ({
                        label: s.serviceName,
                        value: s.total,
                      }))}
                    />
                  </Stack>
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
              doctors.data &&
              downloadCsv(doctorsToRows(doctors.data, doctorName), `shifokorlar_${suffix}`)
            }
            onXlsx={() =>
              doctors.data &&
              downloadXlsx(doctorsToRows(doctors.data, doctorName), `shifokorlar_${suffix}`)
            }
            exportLabel={exportLabel}
          >
            {doctors.data && (
              <Stack gap="md">
                <BarMini
                  data={doctors.data.map((d) => ({
                    label: doctorName(d.doctorId),
                    value: d.total,
                  }))}
                />
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
                        <Table.Td>{doctorName(d.doctorId)}</Table.Td>
                        <Table.Td>{fmt(d.total)}</Table.Td>
                        <Table.Td>{fmt(d.completed)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Stack>
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

        {/* To'lov usuli taqsimoti (DS12-A Task 3) */}
        {revenue.data && revenue.data.byPaymentMethod.length > 0 && (
          <Card withBorder padding="lg">
            <Stack gap="md">
              <Title order={4}>
                {t('reports.byPaymentMethod', { defaultValue: "To'lov usuli" })}
              </Title>
              <Group align="flex-start" gap="xl">
                <Donut
                  title={t('reports.byPaymentMethod')}
                  segments={revenue.data.byPaymentMethod.map((p) => ({
                    label: t(`payment.method.${p.paymentMethod}`, {
                      defaultValue: p.paymentMethod,
                    }),
                    value: p.total,
                    color: methodColor(p.paymentMethod),
                  }))}
                />
                <Stack gap="xs">
                  {revenue.data.byPaymentMethod.map((p) => (
                    <Group key={p.paymentMethod} gap="xs">
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          background: methodColor(p.paymentMethod),
                          flexShrink: 0,
                        }}
                      />
                      <Text size="sm">
                        {t(`payment.method.${p.paymentMethod}`, { defaultValue: p.paymentMethod })}
                        {': '}
                        {formatCurrency(p.total, t)}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Group>
            </Stack>
          </Card>
        )}

        {/* Qabullar bandligi issiqligi (DS12-A Task 4) */}
        {appointments.data && appointments.data.occupancy.length > 0 && (
          <Card withBorder padding="lg">
            <Stack gap="md">
              <Title order={4}>{t('reports.occupancy')}</Title>
              <Heatmap cells={appointments.data.occupancy} />
            </Stack>
          </Card>
        )}

        {/* Dental analitika (V2-3) */}
        <Card withBorder padding="lg">
          <Stack gap="md">
            <Title order={4}>
              {t('reports.dental_analytics', { defaultValue: 'Dental analitika' })}
            </Title>
            {analytics.isLoading ? (
              <StateView status="loading" skeleton="cards" />
            ) : analytics.isError ? (
              <StateView
                status="error"
                title={statesLabels.errorTitle}
                retryLabel={statesLabels.retry}
                onRetry={() => analytics.refetch()}
              />
            ) : analytics.data ? (
              <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
                <Stack gap="xs">
                  <Text fw={600}>{t('reports.procedure_mix')}</Text>
                  {analytics.data.procedureMix.length > 0 ? (
                    <BarMini
                      data={analytics.data.procedureMix.map((p) => ({
                        label: p.serviceName,
                        value: p.revenue,
                      }))}
                    />
                  ) : (
                    <Text c="dimmed">{t('reports.empty')}</Text>
                  )}
                </Stack>
                <Stack gap="xs">
                  <Text fw={600}>{t('reports.retention')}</Text>
                  <Group gap="xl">
                    <Text>
                      {t('reports.retention_new')}: {fmt(analytics.data.retention.newPatients)}
                    </Text>
                    <Text>
                      {t('reports.retention_returning')}:{' '}
                      {fmt(analytics.data.retention.returningPatients)}
                    </Text>
                    <Text>
                      {t('reports.rate')}: {pct(analytics.data.retention.retentionRate)}
                    </Text>
                  </Group>
                  <Text fw={600} mt="sm">
                    {t('reports.recall_efficacy')}
                  </Text>
                  <Text>
                    {fmt(analytics.data.recallEfficacy.converted)} /{' '}
                    {fmt(analytics.data.recallEfficacy.total)} ={' '}
                    {pct(analytics.data.recallEfficacy.efficacy)}
                  </Text>
                </Stack>
                <Stack gap="xs">
                  <Text fw={600}>{t('reports.no_show_trend')}</Text>
                  <BarMini
                    data={analytics.data.noShowByWeekday.map((w) => ({
                      label: WEEKDAY_LABELS[w.weekday] ?? String(w.weekday),
                      value: Math.round(w.rate * 100),
                    }))}
                  />
                </Stack>
              </SimpleGrid>
            ) : (
              <StateView status="empty" title={statesLabels.emptyTitle} />
            )}
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
