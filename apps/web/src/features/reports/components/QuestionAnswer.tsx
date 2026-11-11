import { Anchor, Card, Group, Stack, Table, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useDoctors } from '@/features/appointments/appointments.api';
import { Donut } from '@/features/dashboard/components/widgets/Donut';
import { Heatmap } from '@/features/dashboard/components/widgets/Heatmap';
import { PnlPanel } from '@/features/expenses/components/PnlPanel';
import { formatCurrency, formatNumber } from '@/lib/format';
import {
  useAppointmentStats,
  useDebtAgingReport,
  useDentalAnalytics,
  useDoctorWorkload,
  useOneCExport,
  useOwnerTodayReport,
  usePlanCompletion,
  usePnlReport,
  useRevenueReport,
} from '../reports.api';
import {
  appointmentsToRows,
  debtToRows,
  doctorsToRows,
  download1C,
  downloadXlsx,
  oneCToRows,
  planCompletionToRows,
  procedureMixToRows,
  revenueToRows,
} from '../reports.export';
import type { QuestionKey } from '../reports.questions';
import type { ReportRange } from '../reports.types';
import { AnswerShell } from './AnswerShell';
import { BarMini } from './BarMini';

type Props = { question: QuestionKey; range: ReportRange; ready: boolean };

const methodColor = (m: string) =>
  m === 'cash'
    ? 'var(--success)'
    : m === 'card'
      ? 'var(--info)'
      : m === 'transfer'
        ? 'var(--violet)'
        : 'var(--ink-3)';

const AGING_COLORS: Record<string, string> = {
  d0_30: 'var(--warning)',
  d31_60: 'var(--warning)',
  d61_90: 'var(--danger)',
  d90_plus: 'var(--danger)',
};

function DataTable({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <Card withBorder padding={0} radius="lg">
      <Table.ScrollContainer minWidth={560}>
        <Table verticalSpacing="sm" horizontalSpacing="lg">
          <Table.Thead>
            <Table.Tr>
              {head.map((h, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: statik sarlavha ro'yxati
                <Table.Th key={i} scope="col">
                  {h}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{children}</Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function QuestionAnswer({ question, range, ready }: Props) {
  switch (question) {
    case 'today':
      return <TodayAnswer range={range} ready={ready} />;
    case 'revenue':
      return <RevenueAnswer range={range} ready={ready} />;
    case 'debt':
      return <DebtAnswer ready={ready} />;
    case 'services':
      return <ServicesAnswer range={range} ready={ready} />;
    case 'pnl':
      return <PnlAnswer range={range} ready={ready} />;
    case 'doctors':
      return <DoctorsAnswer range={range} ready={ready} />;
    case 'appointments':
      return <AppointmentsAnswer range={range} ready={ready} />;
    case 'newPatients':
      return <NewPatientsAnswer range={range} ready={ready} />;
    case 'recall':
      return <RecallAnswer range={range} ready={ready} />;
    case 'plans':
      return <PlansAnswer range={range} ready={ready} />;
    default:
      return null; // `soon` savollar ochilmaydi
  }
}

type SubProps = { range: ReportRange; ready: boolean };

function TodayAnswer({ range, ready }: SubProps) {
  const { t } = useTranslation();
  const q = useOwnerTodayReport(range.branchId, { enabled: ready });
  const d = q.data;
  return (
    <AnswerShell
      title={t('reportsQ.q.today')}
      query={q}
      hasData={!!d}
      sentence={
        d &&
        t('reportsQ.answer.today', {
          net: formatCurrency(d.netTotal, t),
          refunded: formatCurrency(d.refunded, t),
        })
      }
      chart={
        d && d.byPaymentMethod.length > 0 ? (
          <BarMini
            data={d.byPaymentMethod.map((p) => ({
              label: t(`payment.method.${p.paymentMethod}`, { defaultValue: p.paymentMethod }),
              value: p.total,
              color: methodColor(p.paymentMethod),
            }))}
          />
        ) : undefined
      }
      howText={t('reportsQ.howText.today')}
      table={
        d && (
          <DataTable
            head={[
              t('reportsQ.col.branch'),
              t('reportsQ.col.revenue'),
              t('reportsQ.col.patients'),
              t('reportsQ.col.action'),
            ]}
          >
            {d.branches.map((b) => (
              <Table.Tr key={b.branchId}>
                <Table.Td fw={700}>{b.name}</Table.Td>
                <Table.Td>{formatCurrency(b.netRevenue, t)}</Table.Td>
                <Table.Td>{formatNumber(b.patients)}</Table.Td>
                <Table.Td>
                  <Anchor component={Link} to="/appointments" size="sm" fw={600}>
                    {t('reportsQ.action.schedule')}
                  </Anchor>
                </Table.Td>
              </Table.Tr>
            ))}
          </DataTable>
        )
      }
    />
  );
}

function RevenueAnswer({ range, ready }: SubProps) {
  const { t } = useTranslation();
  const q = useRevenueReport(range, { enabled: ready });
  const oneC = useOneCExport(range);
  const d = q.data;
  const suffix = `${range.from}_${range.to}`;
  return (
    <AnswerShell
      title={t('reportsQ.q.revenue')}
      query={q}
      hasData={!!d}
      sentence={
        d &&
        t('reportsQ.answer.revenue', {
          from: range.from,
          to: range.to,
          total: formatCurrency(d.total, t),
        })
      }
      chart={
        d && (
          <Stack gap="lg">
            {d.byPeriod.length > 0 && (
              <Stack gap="xs">
                <Text fw={600}>{t('reportsQ.chart.trend')}</Text>
                <BarMini data={d.byPeriod.map((p) => ({ label: p.date, value: p.total }))} />
              </Stack>
            )}
            {d.byPaymentMethod.length > 0 && (
              <Stack gap="xs">
                <Text fw={600}>{t('reportsQ.chart.payment')}</Text>
                <Group align="flex-start" gap="xl">
                  <Donut
                    title={t('reportsQ.chart.payment')}
                    segments={d.byPaymentMethod.map((p) => ({
                      label: t(`payment.method.${p.paymentMethod}`, {
                        defaultValue: p.paymentMethod,
                      }),
                      value: p.total,
                      color: methodColor(p.paymentMethod),
                    }))}
                  />
                </Group>
              </Stack>
            )}
          </Stack>
        )
      }
      howText={t('reportsQ.howText.revenue')}
      onExcel={d ? () => downloadXlsx(revenueToRows(d), `daromad_${suffix}`) : undefined}
      oneCLoading={oneC.isFetching}
      onOneC={async () => {
        const { data } = await oneC.refetch();
        if (data) download1C(oneCToRows(data), `1c_export_${suffix}`);
      }}
      table={
        d && (
          <DataTable head={[t('reportsQ.col.service'), t('reportsQ.col.revenue')]}>
            {d.byService.map((s) => (
              <Table.Tr key={s.serviceName}>
                <Table.Td fw={700}>{s.serviceName}</Table.Td>
                <Table.Td>{formatCurrency(s.total, t)}</Table.Td>
              </Table.Tr>
            ))}
          </DataTable>
        )
      }
    />
  );
}

function DebtAnswer({ ready }: { ready: boolean }) {
  const { t } = useTranslation();
  const q = useDebtAgingReport({ enabled: ready });
  const d = q.data;
  const label = (k: string) => t(`reportsQ.aging.${k}`);
  return (
    <AnswerShell
      title={t('reportsQ.q.debt')}
      query={q}
      hasData={!!d}
      sentence={
        d &&
        (d.patientCount === 0
          ? t('reportsQ.answer.debtNone')
          : t('reportsQ.answer.debt', {
              count: d.patientCount,
              amount: formatCurrency(d.totalDebt, t),
              over90: d.over90Count,
            }))
      }
      chart={
        d && (
          <BarMini
            data={d.buckets.map((b) => ({
              label: label(b.key),
              value: b.amount,
              color: AGING_COLORS[b.key],
            }))}
          />
        )
      }
      howText={t('reportsQ.howText.debt')}
      onExcel={d ? () => downloadXlsx(debtToRows(d, label), 'qarz_muddati') : undefined}
      table={
        d && (
          <DataTable
            head={[
              t('reportsQ.col.age'),
              t('reportsQ.col.patients'),
              t('reportsQ.col.amount'),
              t('reportsQ.col.action'),
            ]}
          >
            {d.buckets.map((b) => (
              <Table.Tr key={b.key}>
                <Table.Td fw={700}>{label(b.key)}</Table.Td>
                <Table.Td>{formatNumber(b.patients)}</Table.Td>
                <Table.Td c="var(--danger)" fw={700}>
                  {formatCurrency(b.amount, t)}
                </Table.Td>
                <Table.Td>
                  <Anchor component={Link} to="/patients" size="sm" fw={600}>
                    {t('reportsQ.action.patients')}
                  </Anchor>
                </Table.Td>
              </Table.Tr>
            ))}
          </DataTable>
        )
      }
    />
  );
}

function ServicesAnswer({ range, ready }: SubProps) {
  const { t } = useTranslation();
  const q = useDentalAnalytics(range, { enabled: ready });
  const mix = useMemo(
    () => [...(q.data?.procedureMix ?? [])].sort((a, b) => b.margin - a.margin),
    [q.data],
  );
  const top = mix[0];
  return (
    <AnswerShell
      title={t('reportsQ.q.services')}
      query={q}
      hasData={mix.length > 0}
      sentence={
        top &&
        t('reportsQ.answer.services', {
          name: top.serviceName,
          margin: formatCurrency(top.margin, t),
        })
      }
      chart={<BarMini data={mix.map((p) => ({ label: p.serviceName, value: p.margin }))} />}
      howText={t('reportsQ.howText.services')}
      onExcel={() => downloadXlsx(procedureMixToRows(mix), `xizmatlar_${range.from}_${range.to}`)}
      table={
        <DataTable
          head={[
            t('reportsQ.col.service'),
            t('reportsQ.col.count'),
            t('reportsQ.col.revenue'),
            t('reportsQ.col.material'),
            t('reportsQ.col.margin'),
            t('reportsQ.col.marginPct'),
          ]}
        >
          {mix.map((p) => (
            <Table.Tr key={p.serviceName}>
              <Table.Td fw={700}>{p.serviceName}</Table.Td>
              <Table.Td>{formatNumber(p.count)}</Table.Td>
              <Table.Td>{formatCurrency(p.revenue, t)}</Table.Td>
              <Table.Td>{formatCurrency(p.materialCost, t)}</Table.Td>
              <Table.Td>{formatCurrency(p.margin, t)}</Table.Td>
              <Table.Td>{p.marginPct === null ? '—' : pct(p.marginPct)}</Table.Td>
            </Table.Tr>
          ))}
        </DataTable>
      }
    />
  );
}

function PnlAnswer({ range, ready }: SubProps) {
  const { t } = useTranslation();
  const q = usePnlReport(range, { enabled: ready });
  const d = q.data;
  return (
    <AnswerShell
      title={t('reportsQ.q.pnl')}
      query={q}
      hasData={!!d}
      sentence={
        d &&
        t('reportsQ.answer.pnl', {
          net: formatCurrency(d.netProfit, t),
          revenue: formatCurrency(d.revenue, t),
          expenses: formatCurrency(d.expenses, t),
        })
      }
      chart={d && <PnlPanel pnl={d} />}
      howText={t('reportsQ.howText.pnl')}
    />
  );
}

function DoctorsAnswer({ range, ready }: SubProps) {
  const { t } = useTranslation();
  const q = useDoctorWorkload(range, { enabled: ready });
  const doctorList = useDoctors();
  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of doctorList.data ?? []) map.set(d.id, d.name);
    return (id: string) => map.get(id) ?? id.slice(0, 8);
  }, [doctorList.data]);
  const rows = q.data ?? [];
  const total = rows.reduce((s, r) => s + r.total, 0);
  const completed = rows.reduce((s, r) => s + r.completed, 0);
  return (
    <AnswerShell
      title={t('reportsQ.q.doctors')}
      query={q}
      hasData={rows.length > 0}
      sentence={t('reportsQ.answer.doctors', { count: rows.length, total, completed })}
      chart={<BarMini data={rows.map((r) => ({ label: nameOf(r.doctorId), value: r.total }))} />}
      howText={t('reportsQ.howText.doctors')}
      onExcel={() =>
        downloadXlsx(doctorsToRows(rows, nameOf), `shifokorlar_${range.from}_${range.to}`)
      }
      table={
        <DataTable
          head={[
            t('reportsQ.col.doctor'),
            t('reportsQ.col.total'),
            t('reportsQ.col.completed'),
            t('reportsQ.col.action'),
          ]}
        >
          {rows.map((r) => (
            <Table.Tr key={r.doctorId}>
              <Table.Td fw={700}>{nameOf(r.doctorId)}</Table.Td>
              <Table.Td>{formatNumber(r.total)}</Table.Td>
              <Table.Td>{formatNumber(r.completed)}</Table.Td>
              <Table.Td>
                <Anchor component={Link} to="/appointments" size="sm" fw={600}>
                  {t('reportsQ.action.schedule')}
                </Anchor>
              </Table.Td>
            </Table.Tr>
          ))}
        </DataTable>
      }
    />
  );
}

function AppointmentsAnswer({ range, ready }: SubProps) {
  const { t } = useTranslation();
  const q = useAppointmentStats(range, { enabled: ready });
  const d = q.data;
  return (
    <AnswerShell
      title={t('reportsQ.q.appointments')}
      query={q}
      hasData={!!d && d.total > 0}
      sentence={
        d &&
        t('reportsQ.answer.appointments', {
          total: d.total,
          noShow: pct(d.noShowRate),
          util: pct(d.slotUtilization),
        })
      }
      chart={
        d && (
          <Stack gap="md">
            <BarMini data={d.byStatus.map((s) => ({ label: s.status, value: s.count }))} />
            {d.occupancy.length > 0 && (
              <Stack gap="xs">
                <Text fw={600}>{t('reportsQ.chart.occupancy')}</Text>
                <Heatmap cells={d.occupancy} />
              </Stack>
            )}
          </Stack>
        )
      }
      howText={t('reportsQ.howText.appointments')}
      onExcel={
        d
          ? () => downloadXlsx(appointmentsToRows(d), `qabullar_${range.from}_${range.to}`)
          : undefined
      }
      table={
        d && (
          <DataTable head={[t('reportsQ.col.status'), t('reportsQ.col.count')]}>
            {d.byStatus.map((s) => (
              <Table.Tr key={s.status}>
                <Table.Td fw={700}>{s.status}</Table.Td>
                <Table.Td>{formatNumber(s.count)}</Table.Td>
              </Table.Tr>
            ))}
          </DataTable>
        )
      }
    />
  );
}

function NewPatientsAnswer({ range, ready }: SubProps) {
  const { t } = useTranslation();
  const q = useDentalAnalytics(range, { enabled: ready });
  const r = q.data?.retention;
  return (
    <AnswerShell
      title={t('reportsQ.q.newPatients')}
      query={q}
      hasData={!!r && r.newPatients + r.returningPatients > 0}
      sentence={
        r &&
        t('reportsQ.answer.newPatients', {
          new: r.newPatients,
          returning: r.returningPatients,
          rate: pct(r.retentionRate),
        })
      }
      chart={
        r && (
          <BarMini
            data={[
              { label: t('reports.retention_new'), value: r.newPatients },
              { label: t('reports.retention_returning'), value: r.returningPatients },
            ]}
          />
        )
      }
      howText={t('reportsQ.howText.newPatients')}
    />
  );
}

function RecallAnswer({ range, ready }: SubProps) {
  const { t } = useTranslation();
  const q = useDentalAnalytics(range, { enabled: ready });
  const r = q.data?.recallEfficacy;
  return (
    <AnswerShell
      title={t('reportsQ.q.recall')}
      query={q}
      hasData={!!r && r.total > 0}
      sentence={
        r &&
        t('reportsQ.answer.recall', {
          total: r.total,
          converted: r.converted,
          rate: pct(r.efficacy),
        })
      }
      chart={r && <BarMini data={r.byStatus.map((s) => ({ label: s.status, value: s.count }))} />}
      howText={t('reportsQ.howText.recall')}
    />
  );
}

function PlansAnswer({ range, ready }: SubProps) {
  const { t } = useTranslation();
  const q = usePlanCompletion(range, { enabled: ready });
  const d = q.data;
  return (
    <AnswerShell
      title={t('reportsQ.q.plans')}
      query={q}
      hasData={!!d && d.totalStages > 0}
      sentence={
        d &&
        t('reportsQ.answer.plans', {
          total: d.totalStages,
          done: d.completedStages,
          rate: pct(d.rate),
        })
      }
      chart={d && <BarMini data={d.byStatus.map((s) => ({ label: s.status, value: s.count }))} />}
      howText={t('reportsQ.howText.plans')}
      onExcel={
        d
          ? () => downloadXlsx(planCompletionToRows(d), `rejalar_${range.from}_${range.to}`)
          : undefined
      }
    />
  );
}
