import { Modal } from '@mantine/core';
import { type ReactNode, useEffect, useState } from 'react';
import classes from './CriticalActionDialog.module.css';

export interface CriticalActionReason {
  value: string;
  label: string;
}

export interface CriticalActionDialogProps {
  opened: boolean;
  /** Dialog sarlavhasi (masalan "Allergiya ogohlantirishi"). */
  title: ReactNode;
  /** Nima xavfli ekanini tushuntiruvchi matn. */
  children: ReactNode;
  /** Davom etish uchun tanlanadigan sabablar. Bo'sh bo'lsa sabab talab qilinmaydi. */
  reasons?: CriticalActionReason[];
  /** Sabab guruhi yorlig'i (a11y). */
  reasonsLabel?: string;
  /** Xavfsiz variant — ASOSIY (teal) tugma. */
  safeLabel: string;
  /** Xavfli davom etish — ikkinchi darajali tugma; sabab tanlanmaguncha disabled. */
  dangerLabel: string;
  /** Xavfsiz variant tanlandi (yoki Esc). */
  onSafe: () => void;
  /** Xavfli davom etish — tanlangan sabab bilan. Sabab shu yerda saqlanishi kerak. */
  onConfirm: (reason: string | null) => void;
}

/**
 * 1-daraja ogohlantirish — FAQAT xavfli harakatda (allergiya, dori ziddiyati...).
 * Xavfsiz variant asosiy tugma; xavfli davom etish sabab tanlangandan keyingina faol.
 * Tashqariga bosish yopmaydi (tasodifiy tasdiqlashni oldini olish).
 */
export function CriticalActionDialog({
  opened,
  title,
  children,
  reasons = [],
  reasonsLabel,
  safeLabel,
  dangerLabel,
  onSafe,
  onConfirm,
}: CriticalActionDialogProps) {
  const [reason, setReason] = useState<string | null>(null);

  // Har ochilishda sabab qayta so'raladi (oldingi tanlov qolib ketmasin).
  useEffect(() => {
    if (opened) setReason(null);
  }, [opened]);

  const needsReason = reasons.length > 0;
  const canConfirm = !needsReason || reason !== null;

  return (
    <Modal
      opened={opened}
      onClose={onSafe}
      withCloseButton={false}
      closeOnClickOutside={false}
      centered
      size={520}
      radius="lg"
      transitionProps={{ duration: 0 }}
      classNames={{ content: classes.content, body: classes.body }}
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <div className={classes.head}>
        <svg
          aria-hidden="true"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <path d="M12 3 2 21h20zM12 10v5M12 18v.01" />
        </svg>
        <strong>{title}</strong>
      </div>
      <div className={classes.message}>{children}</div>
      {needsReason && (
        <div className={classes.reasons} role="radiogroup" aria-label={reasonsLabel}>
          {reasons.map((r) => (
            // biome-ignore lint/a11y/useSemanticElements: pill ko'rinishidagi radio (kanvas), tugma+role=radio
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={reason === r.value}
              className={classes.reason}
              onClick={() => setReason(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
      <div className={classes.actions}>
        <button
          type="button"
          className={classes.danger}
          disabled={!canConfirm}
          onClick={() => onConfirm(reason)}
        >
          {dangerLabel}
        </button>
        <button type="button" className={classes.safe} onClick={onSafe}>
          {safeLabel}
        </button>
      </div>
    </Modal>
  );
}
