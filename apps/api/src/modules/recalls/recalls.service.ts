import type { Context } from 'hono';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { CLINIC_TZ } from '../../lib/sms-templates.ts';
import { createRecallsRepository } from './recalls.repository.ts';
import type {
  CreateRecallInput,
  ListRecallsQuery,
  MarkContactedInput,
  UpdateRecallInput,
} from './recalls.schema.ts';

/** pending/contacted'dan boshqa holatlar — yopilgan (closedBy/closedAt yoziladi). */
const CLOSED_STATUSES = new Set(['scheduled', 'completed', 'dismissed']);

/**
 * Bugungi klinika-local kun (YYYY-MM-DD) + N oy → due-date string.
 * `date` ustun instant emas — klinika kalendar kuni (Asia/Tashkent) bilan ishlaymiz.
 */
export function computeDueDate(intervalMonths: number, now: Date = new Date()): string {
  // Klinika TZ'dagi sana qismlari.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const y = get('year');
  const m = get('month'); // 1-12
  const d = get('day');
  // UTC anchor (kun boshini buzmaslik uchun) + oy qo'shish; oy oxiri overflow'i
  // Date normalizatsiyasi bilan hal qilinadi (mas. 31-yanvar +1 oy → mart emas?
  // setUTCMonth oxirgi kunni mos kamaytiradi).
  const anchor = new Date(Date.UTC(y, m - 1, d));
  anchor.setUTCMonth(anchor.getUTCMonth() + intervalMonths);
  return anchor.toISOString().slice(0, 10);
}

export const createRecallsService = (deps: { audit: AuditLogger }) => {
  const repo = createRecallsRepository();

  const list = (c: Context, query: ListRecallsQuery) => repo.list(c, query);
  const listByPatient = (c: Context, patientId: string) => repo.listByPatient(c, patientId);
  const getById = (c: Context, id: string) => repo.findById(c, id);

  async function create(c: Context, input: CreateRecallInput) {
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    const created = await repo.insert(c, {
      tenantId,
      patientId: input.patientId,
      branchId: input.branchId ?? null,
      reason: input.reason,
      status: 'pending',
      source: 'manual',
      dueDate: input.dueDate,
      intervalMonths: input.intervalMonths ?? null,
      treatmentPlanId: input.treatmentPlanId ?? null,
      assignedDoctorId: input.assignedDoctorId ?? null,
      notes: input.notes ?? null,
      createdBy: user?.id ?? null,
    });
    if (!created) return null;

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'recall',
      resourceId: created.id,
      after: created,
    });
    return created;
  }

  /** Qo'lda "chaqirildi" belgisi (SMS'siz) — contacted + attempt++ + lastContactedAt. */
  async function markContacted(c: Context, id: string, input: MarkContactedInput) {
    const before = await repo.findById(c, id);
    if (!before) return null;

    const updated = await repo.update(c, id, {
      status: 'contacted',
      lastContactedAt: new Date(),
      contactAttempts: before.contactAttempts + 1,
      notes: input.notes ?? before.notes,
    });
    if (updated) {
      await deps.audit.record(c, {
        action: 'contacted',
        resourceType: 'recall',
        resourceId: id,
        before,
        after: updated,
      });
    }
    return updated;
  }

  async function update(c: Context, id: string, input: UpdateRecallInput) {
    const before = await repo.findById(c, id);
    if (!before) return null;
    const user = c.get('user');

    const patch: Partial<Parameters<typeof repo.update>[2]> = {};
    if (input.status) {
      patch.status = input.status;
      if (CLOSED_STATUSES.has(input.status)) {
        patch.closedBy = user?.id ?? null;
        patch.closedAt = new Date();
      }
    }
    if (input.dueDate) patch.dueDate = input.dueDate;
    if (input.branchId !== undefined) patch.branchId = input.branchId;
    if (input.assignedDoctorId !== undefined) patch.assignedDoctorId = input.assignedDoctorId;
    if (input.scheduledAppointmentId !== undefined) {
      patch.scheduledAppointmentId = input.scheduledAppointmentId;
    }
    if (input.notes !== undefined) patch.notes = input.notes;

    const updated = await repo.update(c, id, patch);
    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'recall',
        resourceId: id,
        before,
        after: updated,
      });
    }
    return updated;
  }

  /**
   * Davolash bosqichi tugaganda treatment_followup recall (B4). Idempotent —
   * partial unique index `(patientId, sourceStageId)` bo'yicha onConflictDoNothing
   * (bir bosqich uchun bitta ochiq recall). intervalMonths tenant default'dan.
   */
  async function autoCreateFromStage(
    c: Context,
    args: {
      patientId: string;
      sourceStageId: string;
      treatmentPlanId?: string | null;
      branchId?: string | null;
    },
  ): Promise<void> {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) return;
    const intervalMonths = await repo.getDefaultIntervalMonths(c);
    await repo.insertIfAbsent(c, {
      tenantId,
      patientId: args.patientId,
      branchId: args.branchId ?? null,
      reason: 'treatment_followup',
      status: 'pending',
      source: 'treatment_stage',
      dueDate: computeDueDate(intervalMonths),
      intervalMonths,
      sourceStageId: args.sourceStageId,
      treatmentPlanId: args.treatmentPlanId ?? null,
    });
  }

  /**
   * Yozilish tugaganda (status→completed) profilaktik recall (B4). sourceStageId
   * NULL → partial index dedupe QILMAYDI; shuning uchun service'da "bemorda ochiq
   * preventive bormi?" tekshiruvi bilan gate'lanadi (bir bemor → bitta ochiq
   * preventive). Transition guard (re-PATCH qayta yoqmasligi) chaqiruvchida.
   */
  async function autoCreatePreventive(
    c: Context,
    args: { patientId: string; branchId?: string | null },
  ): Promise<void> {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) return;
    if (await repo.hasOpenByReason(c, args.patientId, 'preventive')) return;
    const intervalMonths = await repo.getDefaultIntervalMonths(c);
    await repo.insert(c, {
      tenantId,
      patientId: args.patientId,
      branchId: args.branchId ?? null,
      reason: 'preventive',
      status: 'pending',
      source: 'appointment',
      dueDate: computeDueDate(intervalMonths),
      intervalMonths,
    });
  }

  /**
   * Bemor qayta yozilganda (appointments.create) — uning ochiq (pending/contacted)
   * recall'larini scheduled qiladi va yozilishga bog'laydi (B5). Idempotent:
   * ochiq recall bo'lmasa no-op.
   */
  async function closeOpenOnRebook(
    c: Context,
    patientId: string,
    newAppointmentId: string,
  ): Promise<void> {
    const user = c.get('user');
    const open = await repo.findOpenByPatient(c, patientId);
    for (const r of open) {
      await repo.update(c, r.id, {
        status: 'scheduled',
        scheduledAppointmentId: newAppointmentId,
        closedBy: user?.id ?? null,
        closedAt: new Date(),
      });
    }
  }

  return {
    list,
    listByPatient,
    getById,
    create,
    markContacted,
    update,
    autoCreateFromStage,
    autoCreatePreventive,
    closeOpenOnRebook,
  };
};

export type RecallsService = ReturnType<typeof createRecallsService>;
