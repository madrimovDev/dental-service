import type { AuditLogEntry } from '@dental/api-client';
import type { AuditRowVM } from './audit.types';

const TZ = 'Asia/Tashkent';

/** UTC ISO → "DD.MM.YYYY HH:mm" (Asia/Tashkent). */
export function formatAuditWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(d)
    .replace(',', '');
}

function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined;
}

/** AuditLogEntry → jadval VM (sana format, detail mavjudligi). */
export function toAuditRowVM(e: AuditLogEntry): AuditRowVM {
  return {
    id: e.id,
    whenText: formatAuditWhen(e.createdAt),
    userId: e.userId,
    action: e.action,
    resourceType: e.resourceType,
    resourceId: e.resourceId,
    before: e.before,
    after: e.after,
    ip: e.ip,
    userAgent: e.userAgent,
    hasDetail: hasValue(e.before) || hasValue(e.after),
  };
}
