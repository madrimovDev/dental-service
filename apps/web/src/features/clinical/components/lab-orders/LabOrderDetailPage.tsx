import type { LabOrderStatus } from '@dental/api-client';
import { Mono, StateView, StatusPill, Tag } from '@dental/ui';
import { Button, Select } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { usePatient } from '@/features/patients/patients.api';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useLabOrder, useUpdateLabOrderStatus } from '../../clinical.api';
import { allowedLabOrderStatuses, toLabOrderVM } from '../../clinical.mappers';
import { LabOrderChain } from './LabOrderChain';
import { LabOrderFiles } from './LabOrderFiles';
import classes from './LabOrderForm.module.css';
import { LabOrderHubPanel } from './LabOrderHubPanel';
import { formatDueDate, type LabOrderWire } from './lab-order.helpers';

/** Buyurtma sahifasi `/lab-orders/:id`: tafsilot, holat zanjiri, fayllar, remake. */
export function LabOrderDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission('lab_order.manage');
  const canApprovePrice = hasPermission('lab_order.approve_price');
  const canViewPatient = hasPermission('patient.view');

  const query = useLabOrder(id);
  const order = query.data as LabOrderWire | undefined;
  // Technician'da `patient.view` yo'q — bemor so'rovi yuborilmaydi (403 shovqini yo'q).
  const patientQuery = usePatient(canViewPatient && order ? order.patientId : '');
  const statusMut = useUpdateLabOrderStatus(order?.patientId ?? '');

  const backTo = order && canViewPatient ? `/patients/${order.patientId}` : '/lab';

  if (query.isError) {
    return (
      <StateView
        status="error"
        title={t('states.error_title')}
        retryLabel={t('states.retry')}
        onRetry={() => query.refetch()}
      />
    );
  }
  if (query.isLoading || !order) return <StateView status="loading" skeleton="cards" />;

  const vm = toLabOrderVM(order);
  const teeth = vm.items.flatMap((it) => it.toothNumbers);
  const materials = vm.items
    .map((it) => it.material)
    .filter(Boolean)
    .join(', ');
  const patient = patientQuery.data;
  const dash = '—';

  return (
    <div className={classes.page}>
      <header className={classes.pageHead}>
        <Link to={backTo} className={classes.back} aria-label={t('labOrders.back')}>
          <IconChevronLeft size={18} aria-hidden="true" />
        </Link>
        <div className={classes.titleBox}>
          <h1 className={classes.title}>
            {order.orderNumber != null
              ? t('labOrders.detail_title', { number: order.orderNumber })
              : t('labOrders.detail_title_plain')}
            {patient ? ` · ${patient.fullName}` : ''}
          </h1>
          <span className={classes.sub}>
            {vm.labName} · {t(vm.typeLabelKey)}
          </span>
        </div>
        <StatusPill status={vm.statusTone}>{t(vm.statusLabelKey)}</StatusPill>
        {canManage && order.status !== 'cancelled' && (
          <Button
            component={Link}
            variant="default"
            to={`/patients/${order.patientId}/lab-orders/new?remakeOf=${order.id}`}
          >
            {t('labOrders.make_remake')}
          </Button>
        )}
      </header>

      <div className={classes.layout}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <section className={classes.card}>
            <h3 className={classes.cardTitle}>{t('labOrder.job_section')}</h3>
            <dl className={classes.kv}>
              <dt>{t('lab_order.lab_name')}</dt>
              <dd>{vm.labName}</dd>
              <dt>{t('labOrder.type')}</dt>
              <dd>{t(vm.typeLabelKey)}</dd>
              <dt>{t('labOrder.teeth')}</dt>
              <dd>{teeth.length > 0 ? <Mono>{teeth.join(', ')}</Mono> : dash}</dd>
              <dt>{t('labOrder.material')}</dt>
              <dd>{materials || dash}</dd>
              <dt>{t('labOrder.shade')}</dt>
              <dd>{order.shade ?? dash}</dd>
              <dt>{t('labOrder.due_date')}</dt>
              <dd>{formatDueDate(order.dueDate) ?? dash}</dd>
              {vm.costText && (
                <>
                  <dt>{t('lab_order.cost')}</dt>
                  <dd>
                    <Mono>
                      {vm.costText} {vm.currency}
                    </Mono>
                  </dd>
                </>
              )}
              {order.notes && (
                <>
                  <dt>{t('labOrder.tech_notes')}</dt>
                  <dd>{order.notes}</dd>
                </>
              )}
              {order.remakeReason && (
                <>
                  <dt>{t('labOrder.remake_badge')}</dt>
                  <dd>
                    <Tag>{t(`labOrder.reason_${order.remakeReason}`)}</Tag>
                  </dd>
                </>
              )}
            </dl>
          </section>

          <LabOrderHubPanel order={order} canManage={canManage} canApprovePrice={canApprovePrice} />

          <section className={classes.card}>
            <h3 className={classes.cardTitle}>{t('labOrder.files_section')}</h3>
            <LabOrderFiles labOrderId={order.id} canManage={canManage} />
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <section className={classes.card}>
            <h3 className={classes.cardTitle}>{t('labOrder.chain_title')}</h3>
            {order.status === 'draft' || order.status === 'cancelled' ? (
              <div className={classes.hint}>{t(`labOrder.chain_${order.status}`, '')}</div>
            ) : (
              <LabOrderChain current={order.status as LabOrderStatus} />
            )}
            {canManage && (
              <Select
                mt="md"
                label={t('lab_order.status')}
                value={order.status}
                onChange={(v) =>
                  v && statusMut.mutate({ id: order.id, status: v as LabOrderStatus })
                }
                data={allowedLabOrderStatuses(order.status)
                  // Portal buyurtmasi: «Yetkazildi» faqat laboratoriya «tayyor» qilgach (server ham 400).
                  .filter(
                    (s) =>
                      s !== 'delivered' ||
                      !order.labHubLabId ||
                      order.hubStatus === 'ready' ||
                      order.status === 'delivered',
                  )
                  .map((s) => ({
                    value: s,
                    label: t(`lab_order.status_${s}`),
                  }))}
                allowDeselect={false}
              />
            )}
          </section>

          <section className={classes.card}>
            <h3 className={classes.cardTitle}>{t('labOrder.sees_title')}</h3>
            <div className={classes.seesGrid} data-testid="lab-sees">
              <span className={classes.seesKey}>{t('labOrder.sees_patient')}</span>
              <span className={classes.seesVal}>
                {/* L3: laboratoriya bemorning TO'LIQ ismini ko'radi (telefon/manzil — yo'q). */}
                {patient
                  ? [patient.fullName, patient.genderLabel, patient.age]
                      .filter((x) => x != null && x !== '')
                      .join(' · ')
                  : dash}
              </span>
              <span className={classes.seesKey}>{t('labHubClinic.sees_code')}</span>
              <span className={classes.seesVal}>
                <Mono>
                  {order.orderNumber != null
                    ? `LO-${order.orderNumber}`
                    : `LO-${order.id.slice(0, 8)}`}
                </Mono>
              </span>
              <span className={classes.seesKey}>{t('labOrder.sees_contact')}</span>
              <span className={classes.seesHidden}>{t('labOrder.sees_hidden')}</span>
            </div>
            <div className={classes.hint}>{t('labOrders.sees_portal_note')}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
