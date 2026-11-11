import type { LabOrderStatus } from '@dental/api-client';
import { Mono, StateView, StatusPill, Tag } from '@dental/ui';
import { Box, Button, Group, Select, Stack, Text, Title } from '@mantine/core';
import { IconDental, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useLabOrders, useUpdateLabOrderStatus } from '../../clinical.api';
import { allowedLabOrderStatuses, toLabOrderVM } from '../../clinical.mappers';
import { LabOrderChain } from './LabOrderChain';
import { LabOrderFiles } from './LabOrderFiles';
import { formatDueDate, type LabOrderWire } from './lab-order.helpers';

type Props = { patientId: string };

/** Mahalliy bugungi kun `YYYY-MM-DD` — muddat o'tganini aniqlash uchun. */
const todayYmd = () => {
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

export function LabOrdersTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const [expanded, setExpanded] = useState<string | null>(null);

  const listQuery = useLabOrders(patientId);
  const updateStatusMut = useUpdateLabOrderStatus(patientId);

  const canManage = hasPermission('lab_order.manage');
  const canView = hasPermission('lab_order.view');

  if (!canView) return <Text c="dimmed">{t('patients.no_medical_permission')}</Text>;

  const orders: LabOrderWire[] = listQuery.data ?? [];
  const wireById = new Map(orders.map((o) => [o.id, o]));

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>{t('lab_order.title')}</Title>
        {canManage && (
          <Button
            component={Link}
            to={`/patients/${patientId}/lab-orders/new`}
            leftSection={<IconPlus size={16} />}
          >
            {t('lab_order.create')}
          </Button>
        )}
      </Group>

      {listQuery.isError ? (
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => listQuery.refetch()}
        />
      ) : listQuery.isLoading ? (
        <StateView status="loading" skeleton="cards" />
      ) : orders.length === 0 ? (
        <StateView status="empty" title={t('lab_order.empty')} />
      ) : (
        <Box
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
          }}
        >
          {/* Table header */}
          <Box
            style={{
              borderBottom: '1px solid var(--border)',
              color: 'var(--ink-3)',
              display: 'grid',
              fontSize: 11,
              fontWeight: 600,
              gap: 12,
              gridTemplateColumns: '96px 1fr 1fr 110px auto',
              letterSpacing: '.02em',
              padding: '10px 18px',
              textTransform: 'uppercase',
            }}
          >
            <span>{t('lab_order.tooth_numbers')}</span>
            <span>{t('lab_order.order_type')}</span>
            <span>
              {t('lab_order.material')} · {t('lab_order.shade')}
            </span>
            <span>{t('labOrder.due_date')}</span>
            <span style={{ textAlign: 'right' }}>{t('lab_order.status')}</span>
          </Box>

          {orders.map((order) => {
            const vm = toLabOrderVM(order);
            const wire = wireById.get(vm.id);
            const teeth = vm.items.flatMap((it) => it.toothNumbers);
            const materials = vm.items
              .map((it) => it.material)
              .filter(Boolean)
              .join(', ');
            const shade = wire?.shade ?? vm.items.find((it) => it.shade)?.shade ?? null;
            const descriptions = vm.items
              .map((it) =>
                it.quantity && it.quantity > 1
                  ? `${it.description} ×${it.quantity}`
                  : it.description,
              )
              .filter(Boolean);
            const dueText = formatDueDate(wire?.dueDate) ?? vm.expectedDateText;
            const isOpen = vm.status !== 'delivered' && vm.status !== 'cancelled';
            const overdue = isOpen && !!wire?.dueDate && wire.dueDate < todayYmd();
            const isExpanded = expanded === vm.id;
            return (
              <Box
                key={vm.id}
                style={{ borderTop: '1px solid var(--border)', padding: '14px 18px' }}
              >
                <Box
                  style={{
                    display: 'grid',
                    gap: 12,
                    gridTemplateColumns: '96px 1fr 1fr 110px auto',
                  }}
                >
                  {/* Tish */}
                  <Box style={{ fontSize: 12 }}>
                    {teeth.length > 0 ? <Mono>{teeth.join(', ')}</Mono> : <span>—</span>}
                  </Box>

                  {/* Ish turi + lab nomi + tavsif */}
                  <Box style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                      <IconDental size={15} style={{ color: 'var(--ink-3)', flex: '0 0 auto' }} />
                      <Text
                        component={Link}
                        to={`/lab-orders/${vm.id}`}
                        fw={700}
                        size="sm"
                        style={{ color: 'var(--ink)' }}
                        truncate
                      >
                        {vm.labName}
                      </Text>
                    </Group>
                    <Group gap={6}>
                      <Tag>{t(vm.typeLabelKey)}</Tag>
                      {wire?.remakeReason && (
                        <Tag>
                          {t('labOrder.remake_badge')} · {t(`labOrder.reason_${wire.remakeReason}`)}
                        </Tag>
                      )}
                    </Group>
                    {descriptions.length > 0 && (
                      <Text size="xs" style={{ color: 'var(--ink-3)' }}>
                        {descriptions.join(', ')}
                      </Text>
                    )}
                  </Box>

                  {/* Material · rang + narx */}
                  <Box style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <Text size="sm" style={{ color: 'var(--ink-2)' }}>
                      {[materials, shade].filter(Boolean).join(' · ') || '—'}
                    </Text>
                    {vm.costText && (
                      <Box style={{ fontSize: 12 }}>
                        <Mono>
                          {vm.costText} {vm.currency}
                        </Mono>
                      </Box>
                    )}
                  </Box>

                  {/* Muddat */}
                  <Box style={{ display: 'flex', flexDirection: 'column', fontSize: 11.5, gap: 2 }}>
                    {dueText ? <Mono>{dueText}</Mono> : <span>—</span>}
                    {overdue && (
                      <Text size="xs" fw={600} style={{ color: 'var(--danger)' }}>
                        {t('labOrder.overdue')}
                      </Text>
                    )}
                    {vm.sentDateText && (
                      <Text size="xs" style={{ color: 'var(--ink-3)' }}>
                        {t('lab_order.sent_date')}: {vm.sentDateText}
                      </Text>
                    )}
                    {vm.deliveredDateText && (
                      <Text size="xs" style={{ color: 'var(--ink-3)' }}>
                        {t('lab_order.delivered_date')}: {vm.deliveredDateText}
                      </Text>
                    )}
                  </Box>

                  {/* Holat — status icon o'ngda + boshqaruv Select */}
                  <Box
                    style={{
                      alignItems: 'flex-end',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <StatusPill status={vm.statusTone}>{t(vm.statusLabelKey)}</StatusPill>
                    {canManage && (
                      <Select
                        size="xs"
                        w={150}
                        value={vm.status}
                        onChange={(v) =>
                          v && updateStatusMut.mutate({ id: vm.id, status: v as LabOrderStatus })
                        }
                        // B2 (CLI-439): joriy status + faqat ruxsat etilgan keyingi
                        // statuslar (forward-only + cancelled) — 6ta shartsiz emas.
                        data={allowedLabOrderStatuses(vm.status).map((s) => ({
                          value: s,
                          label: t(`lab_order.status_${s}`),
                        }))}
                      />
                    )}
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      aria-expanded={isExpanded}
                      onClick={() => setExpanded(isExpanded ? null : vm.id)}
                    >
                      {t('labOrder.show_files')}
                    </Button>
                  </Box>
                </Box>

                {isExpanded && (
                  <Box
                    style={{
                      display: 'grid',
                      gap: 24,
                      gridTemplateColumns: 'minmax(0, 1fr) 280px',
                      marginTop: 14,
                    }}
                  >
                    <LabOrderFiles labOrderId={vm.id} canManage={canManage} />
                    {vm.status !== 'draft' && vm.status !== 'cancelled' && (
                      <LabOrderChain current={vm.status} />
                    )}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Stack>
  );
}
