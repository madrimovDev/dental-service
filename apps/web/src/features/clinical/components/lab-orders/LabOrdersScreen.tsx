import type { ListLabOrdersStatus } from '@dental/api-client';
import { Mono, PageHead, StateView, StatusPill } from '@dental/ui';
import { Group, Pagination, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { type CSSProperties, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useLabOrdersList, usePatientNames } from '../../clinical.api';
import { toLabOrderListRowVM } from '../../clinical.mappers';

const PAGE_SIZE = 20;
const LAB_STATUSES: ListLabOrdersStatus[] = [
  'draft',
  'sent',
  'in_progress',
  'ready',
  'delivered',
  'cancelled',
];

// Dental OS chrome — token-driven inline stillar (RecallDashboard bilan bir xil).
const headStripStyle: CSSProperties = { background: 'var(--surface-2)' };
const thLabelStyle: CSSProperties = {
  color: 'var(--ink-3)',
  fontSize: 'var(--text-xs)',
  fontWeight: 'var(--fw-semibold)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

/** DS7: tenant-wide laboratoriya buyurtmalari ekrani (barcha bemorlar; read-only). */
export function LabOrdersScreen() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canViewPatients = hasPermission('patient.view');

  const [status, setStatus] = useState<ListLabOrdersStatus | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const query = useLabOrdersList({
    status: status ?? undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const rows = useMemo(() => (query.data?.data ?? []).map(toLabOrderListRowVM), [query.data]);
  const nameMap = usePatientNames(
    rows.map((r) => r.patientId),
    canViewPatients,
  );

  const total = query.data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Sahifa-doirasidagi qidiruv (backend matn-qidiruv yo'q) — faqat yuklangan qatorlar.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = (nameMap.get(r.patientId) ?? '').toLowerCase();
      return r.labName.toLowerCase().includes(q) || name.includes(q);
    });
  }, [rows, search, nameMap]);

  const statusOptions = [
    { value: '', label: t('lab_order.list.all_status') },
    ...LAB_STATUSES.map((s) => ({ value: s, label: t(`lab_order.status_${s}`) })),
  ];

  return (
    <Stack gap="lg">
      <PageHead title={t('lab_order.list.title')} subtitle={t('lab_order.list.subtitle')} />

      <Group gap="sm" align="flex-end">
        <TextInput
          flex={1}
          leftSection={<IconSearch size={16} />}
          placeholder={t('lab_order.list.search')}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Select
          w={220}
          placeholder={t('lab_order.list.filter_status')}
          data={statusOptions}
          value={status ?? ''}
          onChange={(v) => {
            setStatus((v || null) as ListLabOrdersStatus | null);
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
        <StateView status="empty" title={t('lab_order.list.empty')} />
      ) : (
        <>
          <Table.ScrollContainer minWidth={820}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead style={headStripStyle}>
                <Table.Tr>
                  <Table.Th style={thLabelStyle}>{t('lab_order.list.col_number')}</Table.Th>
                  <Table.Th style={thLabelStyle}>{t('lab_order.list.col_patient')}</Table.Th>
                  <Table.Th style={thLabelStyle}>{t('lab_order.lab_name')}</Table.Th>
                  <Table.Th style={thLabelStyle}>{t('lab_order.order_type')}</Table.Th>
                  <Table.Th style={thLabelStyle}>{t('lab_order.status')}</Table.Th>
                  <Table.Th style={thLabelStyle}>{t('lab_order.cost')}</Table.Th>
                  <Table.Th style={thLabelStyle}>{t('lab_order.list.col_expected')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filtered.map((r) => {
                  const name = nameMap.get(r.patientId);
                  return (
                    <Table.Tr key={r.id}>
                      <Table.Td>
                        <Mono>{r.orderNumber ?? '—'}</Mono>
                      </Table.Td>
                      <Table.Td>
                        {name ? (
                          <Link to={`/patients/${r.patientId}`}>{name}</Link>
                        ) : (
                          <Mono>{r.patientId.slice(0, 8)}</Mono>
                        )}
                      </Table.Td>
                      <Table.Td>{r.labName}</Table.Td>
                      <Table.Td>{t(r.typeLabelKey)}</Table.Td>
                      <Table.Td>
                        <StatusPill status={r.statusTone}>{t(r.statusLabelKey)}</StatusPill>
                      </Table.Td>
                      <Table.Td>
                        {r.costText ? (
                          <Mono>
                            {r.costText} {r.currency}
                          </Mono>
                        ) : (
                          <Text c="dimmed">—</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {r.expectedDateText ? (
                          <Mono>{r.expectedDateText}</Mono>
                        ) : (
                          <Text c="dimmed">—</Text>
                        )}
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
