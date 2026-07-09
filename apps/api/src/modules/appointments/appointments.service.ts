import {
  appointments,
  permissions,
  rolePermissions,
  userAssignments,
  users,
} from '@dental/db-schema';
import { and, asc, between, eq, gt, gte, lt, lte, ne } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { reminderDelayMs } from '../../lib/reminder-delay.ts';
import type {
  CreateAppointmentInput,
  ListAppointmentsQuery,
  UpdateAppointmentInput,
} from './appointments.schema.ts';
import {
  type AppointmentStatus,
  AppointmentTransitionError,
  assertAppointmentTransition,
  isActiveStatus,
} from './appointments.transitions.ts';

/**
 * Schedule modulidan inject qilinadigan predikatlar (A6, RFC-0009 bog'liqlik
 * yo'nalishi: appointments → schedule). Structural tip — schedule.service'ning
 * `isWithinWorkingHours`/`isOnTimeOff` metodlari shu shaklga mos keladi.
 */
export type SchedulePredicates = {
  isWithinWorkingHours: (
    c: Context,
    doctorId: string,
    branchId: string,
    start: Date,
    end: Date,
  ) => Promise<boolean>;
  isOnTimeOff: (
    c: Context,
    doctorId: string,
    branchId: string,
    start: Date,
    end: Date,
  ) => Promise<boolean>;
};

/**
 * Postgres exclusion_violation (SQLSTATE 23P01) — appointments EXCLUDE gist
 * constraint'lari buzilganda otiladi: CLI-408 `appointments_no_doctor_overlap`
 * (doctor) va CLI-471 `appointments_no_patient_overlap` (patient). `postgres-js`
 * (v3) xatosida `code` SQLSTATE'ni, `constraint_name` esa aynan buzilgan
 * constraint nomini beradi. Race edge-case'da (pre-check o'tib, DB darajasida
 * to'qnashuv) 500 emas — constraint nomiga qarab MOS 409 kodini qaytarish uchun.
 *
 * ⚠️ Ikki constraint mavjud bo'lgani uchun 23P01'ni ko'r-ko'rona `doctor_busy`ga
 * map qilib bo'lmaydi — patient-overlap DB backstop'iga tushsa `patient_busy`
 * qaytarilishi shart, aks holda xato noto'g'ri xabar bilan ko'rinadi.
 */
function exclusionConflictCode(
  err: unknown,
): 'conflict.doctor_busy' | 'conflict.patient_busy' | null {
  if (
    typeof err !== 'object' ||
    err === null ||
    !('code' in err) ||
    (err as { code?: string }).code !== '23P01'
  ) {
    return null;
  }
  const constraint = (err as { constraint_name?: string }).constraint_name;
  if (constraint === 'appointments_no_patient_overlap') return 'conflict.patient_busy';
  // `appointments_no_doctor_overlap` yoki noma'lum → doctor (mavjud xulq).
  return 'conflict.doctor_busy';
}

/**
 * A2 (CLI-438): o'tmishga bron/reschedule guard'i uchun grace oynasi. Aniq
 * `start === now` clock race'ini (submit paytida soniya o'tib ketishi) yutish
 * uchun kichik tolerantlik — availability generatsiyasi (schedule.availability.ts,
 * boshqa modul mas'ul) alohida "endi"dan oldingi slotlarni chiqarib tashlaydi.
 */
const PAST_BOOKING_GRACE_MS = 2 * 60 * 1000;

/** Sof funksiya — berilgan boshlanish vaqti (grace bilan) o'tmishdami. Testlanadigan. */
export function isInPast(start: Date, now: Date = new Date()): boolean {
  return start.getTime() < now.getTime() - PAST_BOOKING_GRACE_MS;
}

/**
 * Recalls modulidan inject qilinadigan narrow dep (B4/B5, RFC-0011 §5).
 * Bog'liqlik yo'nalishi: appointments → recalls (factory injection).
 */
export type RecallAppointmentHook = {
  /** Yozilish completed → profilaktik recall (transition guard chaqiruvchida). */
  autoCreatePreventive: (
    c: Context,
    args: { patientId: string; branchId?: string | null; assignedDoctorId?: string | null },
  ) => Promise<void>;
  /**
   * Yangi yozilish → bemorning ochiq recall'larini scheduled qiladi (rebook).
   * CLI-426: `appointmentStart` relevantlik filtri uchun (due-oynasiga yaqin recall'gina).
   */
  closeOpenOnRebook: (
    c: Context,
    patientId: string,
    newAppointmentId: string,
    appointmentStart: Date,
  ) => Promise<void>;
  /** Yozilish cancel/no_show → uni yopgan scheduled recall'ni pending'ga qaytaradi (CLI-426). */
  reopenOnCancel: (c: Context, appointmentId: string) => Promise<void>;
};

/**
 * CLI-474 (L7): no_show transition'da bemor strike'ini yozuvchi narrow dep.
 * Bog'liqlik: appointments → no-show-strikes (factory injection).
 */
export type NoShowStrikeHook = {
  recordOnNoShow: (
    c: Context,
    args: { tenantId: string; patientId: string; appointmentId: string },
  ) => Promise<void>;
};

export const createAppointmentsService = (deps: {
  audit: AuditLogger;
  schedule?: SchedulePredicates;
  enqueueReminder?: (tenantId: string, appointmentId: string, delayMs: number) => Promise<void>;
  removeReminder?: (appointmentId: string) => Promise<void>;
  recall?: RecallAppointmentHook;
  noShowStrike?: NoShowStrikeHook;
}) => {
  async function checkConflict(
    c: Context,
    doctorId: string,
    start: Date,
    end: Date,
    excludeId?: string,
  ): Promise<boolean> {
    const db = getDb(c);
    const filters = [
      eq(appointments.doctorId, doctorId),
      ne(appointments.status, 'cancelled' as const),
      // Yarim-ochiq [start, end): existing.start < new.end AND existing.end > new.start.
      // `gt` (gte EMAS) — back-to-back (oldingi 11:00 tugaydi, yangi 11:00 boshlanadi)
      // konflikt EMAS.
      lt(appointments.startTime, end),
      gt(appointments.endTime, start),
    ];
    if (excludeId) filters.push(ne(appointments.id, excludeId));

    const [row] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(...filters))
      .limit(1);

    return !!row;
  }

  /**
   * CLI-471: bemor darajasidagi kesishuv (bir bemor bir vaqtda ikki xil doktorga
   * yozila olmaydi). `checkConflict`ni aynan mirror qiladi, faqat filtr `patientId`
   * bo'yicha. Yarim-ochiq [start, end) — back-to-back kesishuv EMAS. Pre-check
   * race'ni yopmaydi; DB `appointments_no_patient_overlap` EXCLUDE backstop qiladi.
   */
  async function checkPatientConflict(
    c: Context,
    patientId: string,
    start: Date,
    end: Date,
    excludeId?: string,
  ): Promise<boolean> {
    const db = getDb(c);
    const filters = [
      eq(appointments.patientId, patientId),
      ne(appointments.status, 'cancelled' as const),
      lt(appointments.startTime, end),
      gt(appointments.endTime, start),
    ];
    if (excludeId) filters.push(ne(appointments.id, excludeId));

    const [row] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(and(...filters))
      .limit(1);

    return !!row;
  }

  /**
   * A6 schedule guard'lari — ish-soati va time-off. Schedule dep yo'q bo'lsa
   * `null` (tekshiruv o'tkazib yuboriladi). Buzilsa error kodi qaytaradi.
   */
  async function checkSchedule(
    c: Context,
    doctorId: string,
    branchId: string,
    start: Date,
    end: Date,
  ): Promise<'schedule.doctor_on_time_off' | 'schedule.outside_working_hours' | null> {
    if (!deps.schedule) return null;
    if (await deps.schedule.isOnTimeOff(c, doctorId, branchId, start, end)) {
      return 'schedule.doctor_on_time_off';
    }
    if (!(await deps.schedule.isWithinWorkingHours(c, doctorId, branchId, start, end))) {
      return 'schedule.outside_working_hours';
    }
    return null;
  }

  async function list(c: Context, query: ListAppointmentsQuery) {
    const db = getDb(c);
    const filters = [];
    if (query.branchId) filters.push(eq(appointments.branchId, query.branchId));
    if (query.doctorId) filters.push(eq(appointments.doctorId, query.doctorId));
    if (query.patientId) filters.push(eq(appointments.patientId, query.patientId));
    if (query.from && query.to) {
      filters.push(between(appointments.startTime, new Date(query.from), new Date(query.to)));
    } else if (query.from) {
      filters.push(gte(appointments.startTime, new Date(query.from)));
    } else if (query.to) {
      filters.push(lte(appointments.startTime, new Date(query.to)));
    }

    // CLI-435: majburiy chegara + barqaror tartib (startTime asc, id tie-break).
    const offset = (query.page - 1) * query.pageSize;
    return db
      .select()
      .from(appointments)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(asc(appointments.startTime), asc(appointments.id))
      .limit(query.pageSize)
      .offset(offset);
  }

  async function getById(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db.select().from(appointments).where(eq(appointments.id, id));
    return row ?? null;
  }

  async function create(c: Context, input: CreateAppointmentInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    const start = new Date(input.startTime);
    const end = new Date(input.endTime);
    if (end <= start) {
      return { ok: false as const, code: 'time.invalid' };
    }
    // A2 (CLI-438): o'tmishga bron backend guard — availability endi o'tган
    // slotlarni ham qaytarishi mumkin (schedule.availability.ts alohida fix
    // talab qiladi), lekin create() har holda rad etadi.
    if (isInPast(start)) {
      return { ok: false as const, code: 'time.in_past' };
    }

    const conflict = await checkConflict(c, input.doctorId, start, end);
    if (conflict) {
      return { ok: false as const, code: 'conflict.doctor_busy' };
    }

    // CLI-471: bemor darajasidagi kesishuv — bir bemor bir vaqtda ikki xil
    // doktorga yozila olmaydi (doctor check'dan KEYIN, kod ajratilishi uchun).
    const patientConflict = await checkPatientConflict(c, input.patientId, start, end);
    if (patientConflict) {
      return { ok: false as const, code: 'conflict.patient_busy' };
    }

    // A6: ish-soati + time-off guard'lari (checkConflict'dan KEYIN). Schedule
    // dep inject qilinmagan bo'lsa o'tkazib yuboriladi (backward-safe).
    const scheduleCheck = await checkSchedule(c, input.doctorId, input.branchId, start, end);
    if (scheduleCheck) return { ok: false as const, code: scheduleCheck };

    let appt: typeof appointments.$inferSelect | undefined;
    try {
      [appt] = await db
        .insert(appointments)
        .values({
          tenantId,
          branchId: input.branchId,
          patientId: input.patientId,
          doctorId: input.doctorId,
          assistantId: input.assistantId ?? null,
          startTime: start,
          endTime: end,
          serviceIds: input.serviceIds,
          notes: input.notes ?? null,
          createdBy: user?.id ?? null,
        })
        .returning();
    } catch (err) {
      // CLI-408/471: pre-check o'tdi-yu EXCLUDE constraint otdi (concurrent race)
      // → constraint nomiga qarab 409 doctor_busy / patient_busy.
      const conflictCode = exclusionConflictCode(err);
      if (conflictCode) return { ok: false as const, code: conflictCode };
      throw err;
    }

    if (!appt) return { ok: false as const, code: 'insert.failed' };

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'appointment',
      resourceId: appt.id,
      after: appt,
    });

    const delay = reminderDelayMs(start, new Date());
    if (delay != null) await deps.enqueueReminder?.(tenantId, appt.id, delay);

    // B5: yangi yozilish — bemorning ochiq recall'larini scheduled qiladi va
    // shu yozilishga bog'laydi (rebook linkage). CLI-426: relevantlik uchun
    // yozilish boshlanish vaqti uzatiladi. Ochiq/relevant recall yo'q → no-op.
    await deps.recall?.closeOpenOnRebook(c, appt.patientId, appt.id, appt.startTime);

    return { ok: true as const, appointment: appt };
  }

  async function update(c: Context, id: string, input: UpdateAppointmentInput) {
    const db = getDb(c);
    const [before] = await db.select().from(appointments).where(eq(appointments.id, id));
    if (!before) return { ok: false as const, code: 'not_found' };

    // CLI-409: state-machine guard. Status o'zgarayotgan bo'lsa transition
    // matritsasini tekshir (invalid → throw → routes 400 status.invalid_transition).
    const beforeStatus = before.status as AppointmentStatus;
    if (input.status && input.status !== beforeStatus) {
      assertAppointmentTransition(beforeStatus, input.status);
    }
    // CLI-409: `completed` — terminal. Status-only idempotent no-op (yuqorida
    // o'tdi), lekin vaqt/doktor/servis/notes tahriri RAD (throw → 400 status.terminal).
    if (beforeStatus === 'completed') {
      const touchesFields =
        input.startTime !== undefined ||
        input.endTime !== undefined ||
        input.doctorId !== undefined ||
        input.serviceIds !== undefined ||
        input.assistantId !== undefined ||
        input.notes !== undefined ||
        input.cancellationReason !== undefined;
      if (touchesFields) throw new AppointmentTransitionError('status.terminal', 'completed');
    }

    // CLI-409: re-validatsiya triggeri — vaqt/doktor o'zgarganda YOKI yangi holat
    // active (scheduled/confirmed/in_progress) ga o'tganda (vaqt o'zgarmasa ham).
    // Bu H5'ni yopadi: cancelled→scheduled band slotga endi conflict topadi.
    const targetStatus = (input.status ?? beforeStatus) as AppointmentStatus;
    const targetActive = isActiveStatus(targetStatus);
    const timeOrDoctorChanged = !!(input.startTime || input.endTime || input.doctorId);
    if (timeOrDoctorChanged || (targetActive && beforeStatus !== targetStatus)) {
      const start = new Date(input.startTime ?? before.startTime);
      const end = new Date(input.endTime ?? before.endTime);
      const doctor = input.doctorId ?? before.doctorId;
      const branch = before.branchId; // branch update PATCH'da yo'q — mavjudni ishlatamiz

      // A2 (CLI-438): faqat YANGI startTime aniq berilganda o'tmish guard'i —
      // status-only o'tish (mas. cancelled→scheduled qayta-faollashtirish, yoki
      // o'tgan 09:00 yozilishni 09:20da completed/no_show qilish) bloklanmasin.
      if (input.startTime && isInPast(start)) {
        return { ok: false as const, code: 'time.in_past' };
      }

      const conflict = await checkConflict(c, doctor, start, end, id);
      if (conflict) return { ok: false as const, code: 'conflict.doctor_busy' };

      // CLI-471: bemor darajasidagi kesishuv. PATCH patientId'ni o'zgartirmaydi —
      // shuning uchun `before.patientId` bo'yicha tekshiramiz (o'zini exclude).
      const patientConflict = await checkPatientConflict(c, before.patientId, start, end, id);
      if (patientConflict) return { ok: false as const, code: 'conflict.patient_busy' };

      // A6: ish-soati + time-off guard'lari (checkConflict'dan KEYIN).
      const scheduleCheck = await checkSchedule(c, doctor, branch, start, end);
      if (scheduleCheck) return { ok: false as const, code: scheduleCheck };
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.startTime) patch.startTime = new Date(input.startTime);
    if (input.endTime) patch.endTime = new Date(input.endTime);
    if (input.doctorId) patch.doctorId = input.doctorId;
    if (input.assistantId !== undefined) patch.assistantId = input.assistantId;
    if (input.status) patch.status = input.status;
    if (input.serviceIds) patch.serviceIds = input.serviceIds;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.cancellationReason !== undefined) patch.cancellationReason = input.cancellationReason;

    let updated: typeof appointments.$inferSelect | undefined;
    try {
      [updated] = await db
        .update(appointments)
        .set(patch)
        .where(eq(appointments.id, id))
        .returning();
    } catch (err) {
      // CLI-408/471: reschedule/reactivation band slotga ustma-ust tushdi →
      // constraint nomiga qarab 409 doctor_busy / patient_busy.
      const conflictCode = exclusionConflictCode(err);
      if (conflictCode) return { ok: false as const, code: conflictCode };
      throw err;
    }

    if (updated) {
      await deps.audit.record(c, {
        action: 'updated',
        resourceType: 'appointment',
        resourceId: id,
        before,
        after: updated,
      });

      // B4: yozilish completed'ga O'TGANDA profilaktik recall (transition guard —
      // before.status != completed && yangi == completed; re-PATCH qayta yoqmaydi).
      // Preventive sourceStageId NULL → service'da open-check bilan dedupe.
      if (input.status === 'completed' && before.status !== 'completed' && deps.recall) {
        await deps.recall.autoCreatePreventive(c, {
          patientId: updated.patientId,
          branchId: updated.branchId,
          // CLI-474 (L9): profilaktik recall'ni yozilish doktoriga biriktir.
          assignedDoctorId: updated.doctorId,
        });
      }

      // CLI-426: yozilish cancel/no_show'ga o'tganda — uni yopgan scheduled
      // recall'ni pending'ga qaytar (dashboardga qaytadi, follow-up yo'qolmaydi).
      if (
        (input.status === 'cancelled' || input.status === 'no_show') &&
        before.status !== input.status &&
        deps.recall
      ) {
        await deps.recall.reopenOnCancel(c, id);
      }

      // CLI-474 (L7): no_show'ga O'TGANDA bemor strike'i (transition edge —
      // re-PATCH no_show→no_show qayta yozmaydi; unique appointmentId ham himoya).
      if (input.status === 'no_show' && before.status !== 'no_show' && deps.noShowStrike) {
        const tenantId = c.get('activeTenantId');
        if (tenantId) {
          await deps.noShowStrike.recordOnNoShow(c, {
            tenantId,
            patientId: updated.patientId,
            appointmentId: id,
          });
        }
      }

      // Reschedule eslatma hayot-sikli (CLI-186): startTime o'zgarsa, eski
      // (eski vaqtli) job'ni o'chir, keyin yangi delay > 0 bo'lsa qayta enqueue.
      // BullMQ jobId bo'yicha dedupe qiladi — `add` qayta yozMAYDI, shuning uchun
      // `remove` MAJBURIY. Yangi vaqt o'tgan/lead ichida → faqat o'chir (delay null).
      // Doktor-only o'zgarish re-enqueue talab qilmaydi (worker doctorId'ni live o'qiydi).
      // A9 (CLI-438): faqat FINAL status ACTIVE bo'lsa re-enqueue qilamiz — bir
      // PATCH'da startTime va status=cancelled/no_show birga kelsa, bekor
      // qilingan yozilishga eslatma qayta qo'yilmasin.
      if (input.startTime) {
        const tenantId = c.get('activeTenantId');
        if (tenantId) {
          await deps.removeReminder?.(id);
          if (isActiveStatus(updated.status as AppointmentStatus)) {
            const delay = reminderDelayMs(new Date(updated.startTime), new Date());
            if (delay != null) await deps.enqueueReminder?.(tenantId, id, delay);
          }
        }
      } else if (
        (input.status === 'cancelled' || input.status === 'no_show') &&
        before.status !== input.status
      ) {
        // A9 (CLI-438): ilgari cancel/no_show job'ni O'CHIRMASDI — worker fire-
        // vaqtida `shouldSkipReminder` bilan status'ni tekshirib SMS'ni
        // yubormasdi, lekin job Redis'da abadiy qolib ketardi (removeOnComplete
        // yo'qligi bilan birga CLI-403'ga bog'liq o'sish). Endi darhol tozalanadi.
        await deps.removeReminder?.(id);
      }
    }
    return { ok: true as const, appointment: updated };
  }

  async function cancel(c: Context, id: string, reason?: string) {
    return update(c, id, { status: 'cancelled', cancellationReason: reason });
  }

  /**
   * Joriy tenant'dagi doktor-rolli xodimlar — yozilish wizardi uchun (CLI-154).
   * `appointment.view` bilan ochiq (yengil) — `user.view` (HR `/users/assignments`)
   * o'rniga, shunda Receptionist ham doktorlar ro'yxatini ko'radi.
   *
   * A1 (CLI-438): deteksiya rol NOMI substring'iga ("doctor" so'zi) EMAS, balki
   * `medical_record.edit` permission'iga tayanadi — barqaror signal (tenant rolni
   * "Shifokor"/"Ortodont" deb qayta nomlasa ham ishlaydi). Role-template'larda
   * (`packages/core/src/role-templates.ts`) faqat Doctor/Doctor+Assistant/Tenant
   * Admin shu permission'ga ega; Nurse faqat `.view`, Receptionist/Technician
   * umuman yo'q — "Doctor's Assistant" (klinik permission'siz) endi ko'rinmaydi.
   * ⚠️ Ma'lum chegara: yakka egа-doktor (tenant owner) role_permissions orqali EMAS,
   * implicit superuser sifatida ishlaydi — bu ro'yxatda ko'rinmaydi (eski substring
   * sxemasida ham ko'rinmasdi, pre-existing gap).
   * RLS tenant'ni filtrlaydi; `selectDistinct` bir userni bir nechta filial
   * assignment'idan dedupe qiladi.
   */
  async function listDoctors(c: Context) {
    const db = getDb(c);
    const rows = await db
      .selectDistinct({
        id: users.id,
        fullName: users.fullName,
        phone: users.phone,
      })
      .from(userAssignments)
      .innerJoin(users, eq(users.id, userAssignments.userId))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userAssignments.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(and(eq(userAssignments.isActive, true), eq(permissions.code, 'medical_record.edit')))
      .orderBy(users.fullName);

    return rows.map((r) => ({ id: r.id, name: r.fullName ?? r.phone }));
  }

  return { list, getById, create, update, cancel, listDoctors };
};

export type AppointmentsService = ReturnType<typeof createAppointmentsService>;
