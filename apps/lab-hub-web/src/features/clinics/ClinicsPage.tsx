import { StateView, StatusPill } from '@dental/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { formatDateTime, formatMoney, formatMonth, shiftMonth } from '@/lib/format';
import { useAuth } from '@/stores/auth';

type Link = {
  id: string;
  clinicId: string;
  clinicName: string;
  status: 'pending' | 'active' | 'rejected' | 'revoked';
  requestedAt: string;
  decidedAt: string | null;
};
type SettlementRow = {
  clinicId: string;
  clinicName: string;
  totalApproved: string;
  caseCount: number;
  paidAt: string | null;
  paidTotal: string | null;
};

const LINK_MEANING = {
  pending: 'waiting',
  active: 'confirmed',
  rejected: 'failed',
  revoked: 'done',
} as const;

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function LinksCard({ isLead }: { isLead: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const links = useQuery({
    queryKey: ['links'],
    queryFn: () => api.get<{ links: Link[] }>('/v1/lab/links'),
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; decision: 'approve' | 'reject' | 'revoke' }) =>
      api.post(`/v1/lab/links/${v.id}/decision`, { decision: v.decision }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['links'] }),
  });

  return (
    <section className="card" aria-labelledby="links-h">
      <h2 id="links-h">{t('labHub.clinics.linksTitle')}</h2>
      {links.isLoading && <StateView status="loading" skeleton="table" />}
      {links.isError && (
        <StateView
          status="error"
          title={t('labHub.common.loadError')}
          onRetry={() => void links.refetch()}
          retryLabel={t('labHub.app.retry')}
        />
      )}
      {links.data && links.data.links.length === 0 && (
        <StateView status="empty" title={t('labHub.clinics.noLinks')} />
      )}
      {links.data && links.data.links.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <tbody>
              {links.data.links.map((l) => (
                <tr key={l.id}>
                  <td>
                    <b>{l.clinicName}</b>
                    <div className="muted">
                      {t('labHub.clinics.requestedAt', {
                        date: formatDateTime(l.requestedAt, i18n.language),
                      })}
                    </div>
                  </td>
                  <td>
                    <StatusPill status={LINK_MEANING[l.status]}>
                      {t(`labHub.clinics.status.${l.status}`)}
                    </StatusPill>
                  </td>
                  <td>
                    {isLead && (
                      <div className="actions" style={{ justifyContent: 'flex-end' }}>
                        {l.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              className="btn btn--danger btn--sm"
                              disabled={decide.isPending}
                              onClick={() => decide.mutate({ id: l.id, decision: 'reject' })}
                            >
                              {t('labHub.clinics.reject')}
                            </button>
                            <button
                              type="button"
                              className="btn btn--primary btn--sm"
                              disabled={decide.isPending}
                              onClick={() => decide.mutate({ id: l.id, decision: 'approve' })}
                            >
                              {t('labHub.clinics.approve')}
                            </button>
                          </>
                        )}
                        {l.status === 'active' && (
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: l.id, decision: 'revoke' })}
                          >
                            {t('labHub.clinics.revoke')}
                          </button>
                        )}
                        {(l.status === 'rejected' || l.status === 'revoked') && (
                          <button
                            type="button"
                            className="btn btn--sm"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: l.id, decision: 'approve' })}
                          >
                            {t('labHub.clinics.reapprove')}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <span className="muted">{t('labHub.clinics.revokeNote')}</span>
    </section>
  );
}

function SettlementsCard() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [period, setPeriod] = useState(thisMonth());
  const cur = t('labHub.common.currency');
  const rows = useQuery({
    queryKey: ['settlements', period],
    queryFn: () => api.get<{ rows: SettlementRow[] }>(`/v1/lab/settlements?period=${period}`),
    enabled: /^\d{4}-\d{2}$/.test(period),
  });
  const mark = useMutation({
    mutationFn: (v: { clinicId: string; paid: boolean }) =>
      api.post('/v1/lab/settlements/mark-paid', { ...v, period }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settlements'] }),
  });

  return (
    <section className="card" aria-labelledby="settle-h">
      <div className="inline-form" style={{ alignItems: 'center' }}>
        <h2 id="settle-h" style={{ marginRight: 'auto' }}>
          {t('labHub.clinics.settlementsTitle')}
        </h2>
        <fieldset className="stepper" aria-label={t('labHub.clinics.period')}>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('labHub.clinics.prevMonth')}
            onClick={() => setPeriod(shiftMonth(period, -1))}
          >
            ‹
          </button>
          <b aria-live="polite">{formatMonth(period, i18n.language)}</b>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('labHub.clinics.nextMonth')}
            onClick={() => setPeriod(shiftMonth(period, 1))}
          >
            ›
          </button>
        </fieldset>
      </div>
      {rows.isLoading && <StateView status="loading" skeleton="table" />}
      {rows.isError && (
        <StateView
          status="error"
          title={t('labHub.common.loadError')}
          onRetry={() => void rows.refetch()}
          retryLabel={t('labHub.app.retry')}
        />
      )}
      {rows.data && rows.data.rows.length === 0 && (
        <StateView status="empty" title={t('labHub.clinics.noSettlements')} />
      )}
      {rows.data && rows.data.rows.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('labHub.clinics.clinic')}</th>
                <th className="num">{t('labHub.clinics.cases')}</th>
                <th className="num">{t('labHub.clinics.total')}</th>
                <th>{t('labHub.clinics.paid')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.data.rows.map((r) => (
                <tr key={r.clinicId}>
                  <td>
                    <b>{r.clinicName}</b>
                  </td>
                  <td className="num">{r.caseCount}</td>
                  <td className="num">{formatMoney(r.totalApproved, i18n.language, cur)}</td>
                  <td>
                    {r.paidAt ? (
                      <StatusPill status="confirmed">
                        {t('labHub.clinics.paidAt', {
                          date: formatDateTime(r.paidAt, i18n.language),
                        })}
                      </StatusPill>
                    ) : (
                      <StatusPill status="waiting">{t('labHub.clinics.unpaid')}</StatusPill>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className={`btn btn--sm ${r.paidAt ? '' : 'btn--primary'}`}
                      disabled={mark.isPending}
                      onClick={() => mark.mutate({ clinicId: r.clinicId, paid: !r.paidAt })}
                    >
                      {r.paidAt ? t('labHub.clinics.markUnpaid') : t('labHub.clinics.markPaid')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ClinicsPage() {
  const { t } = useTranslation();
  const isLead = useAuth((s) => s.user?.role === 'lead');
  return (
    <>
      <header className="page-head">
        <div className="page-head__title">
          <h1>{t('labHub.clinics.title')}</h1>
          <span className="page-head__sub">{t('labHub.clinics.subtitle')}</span>
        </div>
      </header>
      <div className="page-body">
        <LinksCard isLead={isLead} />
        {isLead ? (
          <SettlementsCard />
        ) : (
          <span className="muted">{t('labHub.clinics.settlementsLead')}</span>
        )}
      </div>
    </>
  );
}
