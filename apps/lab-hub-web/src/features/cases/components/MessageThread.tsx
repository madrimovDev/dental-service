import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/lib/format';
import { useSendMessage } from '../cases.api';
import type { CaseMessage } from '../cases.types';

export function MessageThread({
  caseId,
  messages,
  canWrite,
}: {
  caseId: string;
  messages: CaseMessage[];
  canWrite: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState('');
  const send = useSendMessage(caseId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    send.mutate({ body }, { onSuccess: () => setText('') });
  };

  return (
    <div className="files">
      <span className="section-title">{t('labHub.detail.messages')}</span>
      <div className="thread" role="log" aria-label={t('labHub.detail.messages')}>
        {messages.length === 0 && <span className="muted">{t('labHub.detail.noMessages')}</span>}
        {messages.map((m) => (
          <div key={m.id} className={`bubble bubble--${m.author}`}>
            <b>
              {m.authorName ?? (m.author === 'lab' ? t('labHub.detail.you') : '')} ·{' '}
              {formatDateTime(m.createdAt, i18n.language)}
            </b>
            {m.body}
          </div>
        ))}
      </div>
      {canWrite && (
        <form className="composer" onSubmit={submit}>
          <label htmlFor="case-message" className="sr-only">
            {t('labHub.detail.messageLabel')}
          </label>
          <input
            id="case-message"
            className="input"
            placeholder={t('labHub.detail.messagePlaceholder')}
            value={text}
            maxLength={5000}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="btn" disabled={send.isPending || !text.trim()}>
            {t('labHub.detail.send')}
          </button>
        </form>
      )}
    </div>
  );
}
