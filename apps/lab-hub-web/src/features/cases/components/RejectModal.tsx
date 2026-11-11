import { Modal } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function RejectModal({
  opened,
  busy,
  onClose,
  onConfirm,
}: {
  opened: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (opened) setReason('');
  }, [opened]);
  const ok = reason.trim().length > 0;
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('labHub.detail.rejectTitle')}
      centered
      radius="lg"
      transitionProps={{ duration: 0 }}
    >
      <div className="field">
        <label htmlFor="reject-reason">{t('labHub.detail.rejectReason')}</label>
        <textarea
          id="reject-reason"
          className="input"
          value={reason}
          maxLength={2000}
          onChange={(e) => setReason(e.target.value)}
        />
        <span className="field__hint">{t('labHub.detail.rejectHint')}</span>
      </div>
      <div className="actions" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onClose}>
          {t('labHub.common.cancel')}
        </button>
        <button
          type="button"
          className="btn btn--danger"
          disabled={!ok || busy}
          onClick={() => onConfirm(reason.trim())}
        >
          {t('labHub.detail.rejectConfirm')}
        </button>
      </div>
    </Modal>
  );
}
