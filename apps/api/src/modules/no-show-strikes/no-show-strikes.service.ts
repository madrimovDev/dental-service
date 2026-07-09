import type { Context } from 'hono';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import {
  createNoShowStrikesRepository,
  type NoShowStrikesRepository,
} from './no-show-strikes.repository.ts';

/**
 * CLI-474 (L7) — no-show strike biznes mantiq. Strike YARATISH appointment
 * `→ no_show` transition'da (appointments.service hook orqali, reopenOnCancel
 * pretsedenti) — appointment `updated` audit'i uni qamragani uchun alohida audit
 * yozmaydi. WAIVE — registratura mutatsiyasi → audit_log (§3.10).
 */
export const createNoShowStrikesService = (deps: {
  audit: AuditLogger;
  repository?: NoShowStrikesRepository;
}) => {
  const repo = deps.repository ?? createNoShowStrikesRepository();

  /** appointment.service hook — `no_show` transition edge'da chaqiriladi. */
  const recordOnNoShow = (
    c: Context,
    args: { tenantId: string; patientId: string; appointmentId: string },
  ) => repo.recordIfAbsent(c, args);

  const activeCount = (c: Context, patientId: string) => repo.activeCountByPatient(c, patientId);

  const activeCountForPatients = (c: Context, patientIds: string[]) =>
    repo.activeCountForPatients(c, patientIds);

  const listByPatient = (c: Context, patientId: string) => repo.listByPatient(c, patientId);

  const waive = async (c: Context, id: string, args: { reason: string | null }) => {
    const before = await repo.getById(c, id);
    if (!before) return { ok: false as const, code: 'not_found' as const };
    if (before.waived) return { ok: false as const, code: 'already_waived' as const };

    const user = c.get('user');
    const updated = await repo.waive(c, id, { reason: args.reason, userId: user?.id ?? null });
    await deps.audit.record(c, {
      action: 'waived',
      resourceType: 'no_show_strike',
      resourceId: id,
      before,
      after: updated,
    });
    return { ok: true as const, strike: updated };
  };

  return { recordOnNoShow, activeCount, activeCountForPatients, listByPatient, waive };
};

export type NoShowStrikesService = ReturnType<typeof createNoShowStrikesService>;
