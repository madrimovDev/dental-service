import type { Context } from 'hono';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { createRecallsRepository } from './recalls.repository.ts';
import type {
  CreateRecallInput,
  ListRecallsQuery,
  MarkContactedInput,
  UpdateRecallInput,
} from './recalls.schema.ts';

/** pending/contacted'dan boshqa holatlar — yopilgan (closedBy/closedAt yoziladi). */
const CLOSED_STATUSES = new Set(['scheduled', 'completed', 'dismissed']);

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

  return { list, listByPatient, getById, create, markContacted, update };
};

export type RecallsService = ReturnType<typeof createRecallsService>;
