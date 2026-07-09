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
 * Klinika-local (Asia/Tashkent) bugungi kun (YYYY-MM-DD). CLI-466: `summary()`
 * overdue hisobida DB `CURRENT_DATE` o'rniga shu ishlatiladi — `CURRENT_DATE`
 * Postgres session TZ'ga bog'liq (odatda UTC), Tashkent (+5) bilan farqi
 * kuni chegarasida (00:00–04:59 Tashkent) noto'g'ri natija berardi.
 * `queue.service.ts::tashkentDayStart()` / `recall-worker.ts::localDateString()`
 * bilan bir xil pattern (Qaror #22, fixed offset, DST yo'q).
 */
function tashkentTodayString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Rebook relevantlik oynasi (CLI-426): yozilish recall'ni faqat `dueDate − 30 kun`
 * dan keyin (yoki keyingi) boshlansa yopadi. Uzoq kelajakdagi (mas. +4 oy preventive)
 * recall bugungi shoshilinch yozilish bilan yopilmaydi.
 */
const REBOOK_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Yozilish recall'ni yopishga "yetarlicha yaqin"mi — `appointmentStart >= dueDate − 30d`.
 * dueDate klinika-local kun string'i ("YYYY-MM-DD"); UTC yarim tunga anchor qilamiz
 * (grace kun sonida ishlaydi, TZ mayda farqi ahamiyatsiz).
 */
export function isRebookRelevant(dueDate: string, appointmentStart: Date): boolean {
  const dueMs = Date.parse(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(dueMs)) return true; // noto'g'ri sana → eski xulq (yop)
  return appointmentStart.getTime() >= dueMs - REBOOK_GRACE_MS;
}

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

  // A7 (CLI-438): oy-oxiri overflow FIX. Eski kod `setUTCMonth(cur+n)` chaqirardi
  // — bu kunni SAQLAYDI va ortiqcha kunlarni KEYINGI oyga OSHIRIB YUBORADI (izoh
  // "oxirgi kunni mos kamaytiradi" deb da'vo qilardi, lekin JS Date BUNDAY
  // ISHLAMAYDI): 31-yanvar + 1 oy → 3-mart, 28/29-fevral EMAS. To'g'ri clamp:
  // kunni 1ga qo'yib oy qo'shamiz, so'ng target oyning haqiqiy kun-soniga
  // (Date.UTC(y, m+1, 0) — keyingi oyning 0-kuni = shu oyning oxirgi kuni)
  // min() bilan cheklaymiz. Oddiy (o'rta oy) holatlarda xulq o'zgarmaydi.
  const targetMonthAnchor = new Date(Date.UTC(y, m - 1 + intervalMonths, 1));
  const daysInTargetMonth = new Date(
    Date.UTC(targetMonthAnchor.getUTCFullYear(), targetMonthAnchor.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(d, daysInTargetMonth);
  const anchor = new Date(
    Date.UTC(targetMonthAnchor.getUTCFullYear(), targetMonthAnchor.getUTCMonth(), clampedDay),
  );
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
      // CLI-474 (L9): chaqiruvchi (davolash rejasi doktori) uzatadi — recall
      // mas'ul doktorga biriktiriladi (ilgari doim NULL edi).
      assignedDoctorId?: string | null;
    },
  ): Promise<void> {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) return;
    const intervalMonths = await repo.getDefaultIntervalMonths(c);
    await repo.insertIfAbsent(c, {
      tenantId,
      patientId: args.patientId,
      branchId: args.branchId ?? null,
      assignedDoctorId: args.assignedDoctorId ?? null,
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
   *
   * A8 (CLI-438): `hasOpenByReason` check-then-insert — ikki concurrent request
   * (mas. ikki xodim bir vaqtda ikkita appointment'ni "completed" qilsa) SELECT
   * va INSERT orasidagi oynada ikkita ochiq preventive yaratishi mumkin edi.
   * Pre-check BIRINCHI QATOR himoya bo'lib qoladi (tezkor common-case); DB
   * darajasidagi `insertPreventiveIfAbsent` (partial unique index + ON CONFLICT
   * DO NOTHING, `recalls.repository.ts`) — defense-in-depth ikkinchi qatlam
   * (race'da haqiqiy kafolat DB constraint'dan keladi).
   */
  async function autoCreatePreventive(
    c: Context,
    // CLI-474 (L9): `assignedDoctorId` — appointment doktori uzatadi (ilgari NULL).
    args: { patientId: string; branchId?: string | null; assignedDoctorId?: string | null },
  ): Promise<void> {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) return;
    if (await repo.hasOpenByReason(c, args.patientId, 'preventive')) return;
    const intervalMonths = await repo.getDefaultIntervalMonths(c);
    await repo.insertPreventiveIfAbsent(c, {
      tenantId,
      patientId: args.patientId,
      branchId: args.branchId ?? null,
      assignedDoctorId: args.assignedDoctorId ?? null,
      reason: 'preventive',
      status: 'pending',
      source: 'appointment',
      dueDate: computeDueDate(intervalMonths),
      intervalMonths,
    });
  }

  /**
   * Bemor qayta yozilganda (appointments.create) — uning ochiq (pending/contacted)
   * recall'larini scheduled qiladi va yozilishga bog'laydi (B5). CLI-426: faqat
   * yozilish recall due-oynasiga RELEVANT bo'lsa (`start >= dueDate − 30d`) yopadi;
   * uzoq kelajak recall'lar ochiq qoladi (yo'qolmaydi). Idempotent: mos ochiq recall
   * bo'lmasa no-op.
   */
  async function closeOpenOnRebook(
    c: Context,
    patientId: string,
    newAppointmentId: string,
    appointmentStart: Date,
  ): Promise<void> {
    const user = c.get('user');
    const open = await repo.findOpenByPatient(c, patientId);
    for (const r of open) {
      if (!isRebookRelevant(r.dueDate, appointmentStart)) continue;
      await repo.update(c, r.id, {
        status: 'scheduled',
        scheduledAppointmentId: newAppointmentId,
        closedBy: user?.id ?? null,
        closedAt: new Date(),
      });
    }
  }

  /**
   * Yozilish cancel/no_show bo'lganda (appointments.update) — uni yopgan `scheduled`
   * recall'larni `pending`ga qaytaradi (CLI-426 reopen). dueDate o'zgarmaydi → recall
   * dashboardga qaytadi. Faqat SHU yozilish yopgan recall'lar (link bo'yicha).
   */
  async function reopenOnCancel(c: Context, appointmentId: string): Promise<void> {
    const reopened = await repo.reopenByAppointment(c, appointmentId);
    if (reopened > 0) {
      await deps.audit.record(c, {
        action: 'reopened',
        resourceType: 'recall',
        resourceId: appointmentId,
        after: { reopened, appointmentId },
      });
    }
  }

  async function summary(c: Context, branchId?: string, now: Date = new Date()) {
    const today = tashkentTodayString(now);
    const s = await repo.summary(c, branchId, today);
    const converted = s.scheduled + s.completed;
    const efficacyPct = s.total === 0 ? 0 : (converted / s.total) * 100;
    return {
      pending: s.pending,
      contacted: s.contacted,
      scheduled: s.scheduled,
      overdue: s.overdue,
      efficacyPct,
    };
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
    reopenOnCancel,
    summary,
  };
};

export type RecallsService = ReturnType<typeof createRecallsService>;
