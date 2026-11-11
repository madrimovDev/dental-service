import { StateView, StatusPill } from '@dental/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDay } from '@/lib/format';
import { useAuth } from '@/stores/auth';
import {
  useAllCases,
  useAssign,
  useCaseDetail,
  useLabUsers,
  usePriceList,
  useSetStatus,
} from '../cases.api';
import { openLoad, STATUS_MEANING, teethLabel, workTitle } from '../cases.mappers';
import { useDueLabel } from './DueChip';
import { FileList } from './FileList';
import { MessageThread } from './MessageThread';
import { PricePanel } from './PricePanel';
import { RejectModal } from './RejectModal';

export function CaseDetailPanel({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const isLead = useAuth((s) => s.user?.role === 'lead');
  const detail = useCaseDetail(id);
  const users = useLabUsers(isLead);
  const prices = usePriceList(isLead);
  const all = useAllCases();
  const assign = useAssign(id);
  const status = useSetStatus(id);
  const [rejecting, setRejecting] = useState(false);
  const dueLabel = useDueLabel();

  if (detail.isLoading) {
    return (
      <div className="detail" aria-busy="true">
        <StateView status="loading" skeleton="detail" />
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="detail">
        <StateView
          status="error"
          title={t('labHub.detail.loadError')}
          onRetry={() => void detail.refetch()}
          retryLabel={t('labHub.app.retry')}
        />
      </div>
    );
  }

  const { case: c, files, messages } = detail.data;
  const lng = i18n.language;
  const purged = !!c.purgedAt;
  const s = c.status;
  const canAccept = s === 'sent' || s === 'remake';
  const canStart = s === 'accepted';
  const canReady = s === 'accepted' || s === 'in_progress';
  const canReject = s === 'sent' || s === 'remake' || s === 'accepted';
  const due = dueLabel(c.dueDate);
  const dueText = c.dueDate
    ? due.info.kind === 'later' || due.info.kind === 'overdue'
      ? t('labHub.detail.dueValue', {
          date: formatDay(c.dueDate, lng),
          rel:
            due.info.days >= 0
              ? t('labHub.due.inDays', { n: due.info.days })
              : t('labHub.due.overdue', { n: -due.info.days }),
        })
      : `${formatDay(c.dueDate, lng)} · ${due.text}`
    : t('labHub.due.none');
  const load = openLoad(all.data?.cases ?? []);
  const sex =
    c.patientSex === 'female'
      ? t('labHub.detail.sexFemale')
      : c.patientSex === 'male'
        ? t('labHub.detail.sexMale')
        : null;
  const patient = purged
    ? null
    : [
        c.patientName,
        sex,
        c.patientAge != null ? t('labHub.detail.age', { n: c.patientAge }) : null,
        c.clinicCode ? t('labHub.detail.clinicCode', { code: c.clinicCode }) : null,
      ]
        .filter(Boolean)
        .join(' · ');

  const setStatus = (to: 'accepted' | 'in_progress' | 'ready') => status.mutate({ to });

  return (
    <aside className="detail" aria-labelledby="case-title">
      <div className="detail__head">
        <small>{[c.clinicName, c.doctorName].filter(Boolean).join(' · ')}</small>
        <h2 id="case-title">{workTitle(c)}</h2>
        {patient && (
          <span className="detail__patient">{t('labHub.detail.patient', { name: patient })}</span>
        )}
        <div style={{ marginTop: 6 }}>
          <StatusPill status={STATUS_MEANING[s]}>{t(`labHub.status.${s}`)}</StatusPill>
        </div>
      </div>

      {purged && <div className="note">{t('labHub.detail.purged')}</div>}

      <div className="facts">
        <div className="fact">
          <span>{t('labHub.detail.shade')}</span>
          <b className="mono">{c.shade ?? '—'}</b>
        </div>
        <div
          className={`fact ${
            due.info.kind === 'overdue' || due.info.kind === 'today'
              ? 'fact--bad'
              : due.info.kind === 'tomorrow'
                ? 'fact--warn'
                : ''
          }`}
        >
          <span>{t('labHub.detail.due')}</span>
          <b>{dueText}</b>
        </div>
        <div className="fact">
          <span>{t('labHub.detail.teeth')}</span>
          <b className="mono">{c.teeth.length ? teethLabel(c.teeth) : '—'}</b>
        </div>
        <div className="fact">
          <span>{t('labHub.detail.files')}</span>
          <b>{files.length || t('labHub.detail.filesNone')}</b>
        </div>
      </div>

      <div className="note">
        <b>{t('labHub.detail.doctorNote')}</b> {c.note ?? t('labHub.detail.noNote')}
      </div>

      <FileList caseId={c.id} files={files} canUpload={!purged} />
      <MessageThread caseId={c.id} messages={messages} canWrite={!purged} />

      {isLead && (
        <div className="field">
          <label htmlFor="case-tech">{t('labHub.detail.technician')}</label>
          <select
            id="case-tech"
            className="input"
            value={c.assignedTechnicianId ?? ''}
            disabled={assign.isPending}
            onChange={(e) => assign.mutate({ technicianId: e.target.value || null })}
          >
            <option value="">{t('labHub.detail.technicianNone')}</option>
            {(users.data?.users ?? [])
              .filter((u) => u.isActive)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {t('labHub.detail.technicianOption', {
                    name: u.fullName,
                    n: load.get(u.id) ?? 0,
                  })}
                </option>
              ))}
          </select>
        </div>
      )}

      <PricePanel
        key={`${c.id}:${c.proposedPrice}:${c.approvedPrice}`}
        c={c}
        items={prices.data?.items ?? []}
        canPropose={isLead && s !== 'rejected'}
      />

      {s === 'ready' && <div className="note">{t('labHub.detail.readyWait')}</div>}
      {s === 'delivered' && <div className="note">{t('labHub.detail.deliveredInfo')}</div>}
      {s === 'rejected' && (
        <div className="form-error">
          {t('labHub.detail.rejectedInfo', { reason: c.rejectReason ?? '—' })}
        </div>
      )}

      {(canAccept || canStart || canReady || canReject) && (
        <div className="actions">
          {canReject && (
            <button
              type="button"
              className="btn btn--danger btn--lg"
              disabled={status.isPending}
              onClick={() => setRejecting(true)}
            >
              {t('labHub.detail.reject')}
            </button>
          )}
          {canAccept && (
            <button
              type="button"
              className="btn btn--primary btn--lg btn--block"
              disabled={status.isPending}
              onClick={() => setStatus('accepted')}
            >
              {t('labHub.detail.accept')}
            </button>
          )}
          {canStart && (
            <button
              type="button"
              className="btn btn--lg"
              disabled={status.isPending}
              onClick={() => setStatus('in_progress')}
            >
              {t('labHub.detail.start')}
            </button>
          )}
          {canReady && (
            <button
              type="button"
              className="btn btn--primary btn--lg btn--block"
              disabled={status.isPending}
              onClick={() => setStatus('ready')}
            >
              {t('labHub.detail.ready')}
            </button>
          )}
        </div>
      )}
      <span className="muted">{t('labHub.detail.privacy')}</span>

      <RejectModal
        opened={rejecting}
        busy={status.isPending}
        onClose={() => setRejecting(false)}
        onConfirm={(reason) =>
          status.mutate({ to: 'rejected', reason }, { onSuccess: () => setRejecting(false) })
        }
      />
    </aside>
  );
}
