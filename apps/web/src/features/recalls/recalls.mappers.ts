import type { RecallDtoReason, RecallDtoStatus } from './recalls.types';

const TZ = 'Asia/Tashkent';

/**
 * Joriy sana klinika-local 'YYYY-MM-DD' (Asia/Tashkent).
 * ⚠️ `new Date().toISOString().slice(0,10)` ISHLATMA — u UTC sanani beradi
 * (00:00–05:00 Tashkent oralig'ida bir kun xato). Dashboard "bugun" so'rovi
 * + sidebar badge IKKALASI ham shu funksiyani ishlatishi shart (Qaror #22).
 */
export function localToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
}

/**
 * Recall muddati o'tganmi: `dueDate` < `today` (ikkalasi 'YYYY-MM-DD').
 * Leksikografik taqqoslash ISO sanalarda kalendar-tartibga teng.
 */
export function isOverdue(dueDate: string, today: string = localToday()): boolean {
  return dueDate < today;
}

/** Recall status → i18n kalit (`recall.status.*`). */
export function recallStatusLabelKey(status: RecallDtoStatus): string {
  return `recall.status.${status}`;
}

/** Recall sabab → i18n kalit (`recall.reason.*`). */
export function recallReasonLabelKey(reason: RecallDtoReason): string {
  return `recall.reason.${reason}`;
}

/** Backend yetkazib bergan SMS holatlari (workflow status ≠ SMS yetkazish holati). */
const SMS_STATUSES = ['sent', 'pending', 'failed', 'replied'] as const;

/**
 * SMS yetkazish holati → i18n kalit (`recall.sms_status.*`). Backend `smsStatus`
 * `string | null` qaytaradi; noma'lum yoki null → `none` (—).
 */
export function recallSmsStatusLabelKey(smsStatus: string | null): string {
  const known = (SMS_STATUSES as readonly string[]).includes(smsStatus ?? '');
  return `recall.sms_status.${known ? smsStatus : 'none'}`;
}

/** SMS holati → StatusPill toni (vizual semantika). */
export function recallSmsStatusTone(
  smsStatus: string | null,
): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  switch (smsStatus) {
    case 'sent':
      return 'success';
    case 'replied':
      return 'info';
    case 'pending':
      return 'warning';
    case 'failed':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** UTC ISO instant → Asia/Tashkent 'YYYY-MM-DD' (oxirgi bog'lanish sanasi). */
export function formatRecallDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
}
