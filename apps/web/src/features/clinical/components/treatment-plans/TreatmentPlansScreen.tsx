import type { ListTreatmentPlansParams } from '@dental/api-client';
import { Mono, PageHead, StateView, StatusPill } from '@dental/ui';
import { Group, Pagination, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { type CSSProperties, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import { usePatientNames, useTreatmentPlansList } from '../../clinical.api';
import { toPlanListRowVM } from '../../clinical.mappers';

// `ListTreatmentPlansStatus` barrel'da re-export qilinmagan → param tipidan olamiz.
type PlanStatus = NonNullable<ListTreatmentPlansParams['status']>;

const PAGE_SIZE = 20;
const PLAN_STATUSES: PlanStatus[] = [
  'draft',
  'presented',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
];

// Dental OS chrome — token-driven inline stillar (yangi CSS fayl yo'q; RecallDashboard bilan bir xil).
const headStripStyle: CSSProperties = { background: 'var(--surface-2)' };
const thLabelStyle: CSSProperties = {
  color: 'var(--ink-3)',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--fw-semibold)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

/** DS7: tenant-wide davolash rejalari ekrani (barcha bemorlar; read-only ko'rinish). */
export function TreatmentPlansScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canViewPatients = hasPermission('patient.view');

  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const query = useTreatmentPlansList({
    status: status ?? undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const rows = useMemo(() => (query.data?.data ?? []).map(toPlanListRowVM), [query.data]);
  const nameMap = usePatientNames(
    rows.map((r) => r.patientId),
    canViewPatients,
  );

  const total = query.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Sahifa-doirasidagi qidiruv: backend matn-qidiruvni qo'llamaydi, shuning uchun FAQAT
  // joriy sahifada yuklangan qatorlarni filtrlaydi (boshqa sahifalar qamralmaydi).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = (nameMap.get(r.patientId) ?? '').toLowerCase();
      return r.title.toLowerCase().includes(q) || name.includes(q);
    });
  }, [rows, search, nameMap]);

  const statusOptions = [
    { value: '', label: t('treatment_plan.list.all_status') },
    ...PLAN_STATUSES.map((s) => ({ value: s, label: t(`treatment_plan.status_${s}`) })),
  ];

  return (
    <Stack gap="lg">
      <PageHead
        title={t('treatment_plan.list.title')}
        subtitle={t('treatment_plan.list.subtitle')}
      />

      <Group gap="sm" align="flex-end">
        <TextInput
          flex={1}
          leftSection={<IconSearch size={16} />}
          placeholder={t('treatment_plan.list.search')}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Select
          w={220}
          placeholder={t('treatment_plan.list.filter_status')}
          data={statusOptions}
          value={status ?? ''}
          onChange={(v) => {
            setStatus((v || null) as PlanStatus | null);
            setPage(1);
          }}
          allowDeselect={false}
        />
      </Group>

      {query.isError ? (
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => query.refetch()}
        />
      ) : query.isLoading ? (
        <StateView status="loading" skeleton="table" />
      ) : filtered.length === 0 ? (
        <StateView status="empty" title={t('treatment_plan.list.empty')} />
      ) : (
        <>
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead style={headStripStyle}>
                <Table.Tr>
                  <Table.Th style={thLabelStyle}>{t('treatment_plan.list.col_patient')}</Table.Th>
                  <Table.Th style={thLabelStyle}>{t('treatment_plan.plan_title')}</Table.Th>
                  <Table.Th style={thLabelStyle}>{t('treatment_plan.status')}</Table.Th>
                  <Table.Th style={thLabelStyle}>{t('treatment_plan.total_cost')}</Table.Th>
                  <Table.Th style={thLabelStyle}>{t('treatment_plan.total_visits')}</Table.Th>
                  <Table.Th style={thLabelStyle}>{t('treatment_plan.list.col_updated')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map((r) => {
                  const name = nameMap.get(r.patientId);
                  return (
                    <Table.Tr key={r.id}>
                      <Table.Td>
                        {name ? (
                          <Link to={`/patients/${r.patientId}`}>{name}</Link>
                        ) : (
                          <Mono>{r.patientId.slice(0, 8)}</Mono>
                        )}
                      </Table.Td>
                      <Table.Td>{r.title}</Table.Td>
                      <Table.Td>
                        <StatusPill status={r.statusTone}>{t(r.statusLabelKey)}</StatusPill>
                      </Table.Td>
                      <Table.Td>
                        <Mono>
                          {r.totalCostText} {t('common.currency')}
                        </Mono>
                      </Table.Td>
                      <Table.Td>{r.totalVisits}</Table.Td>
                      <Table.Td>
                        <Text c="dimmed">{r.updatedAtText}</Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>

          {totalPages > 1 && (
            <Group justify="flex-end">
              <Pagination value={page} onChange={setPage} total={totalPages} />
            </Group>
          )}
        </>
      )}
    </Stack>
  );
}
