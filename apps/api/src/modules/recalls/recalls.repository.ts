import { patients, type RecallInsert, recalls, tenantSettings } from '@dental/db-schema';
import { and, count, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { RecallWithPatient } from './recalls.mapper.ts';
import type { ListRecallsQuery } from './recalls.schema.ts';

/**
 * A8 (CLI-438): Postgres 42P10 — "no unique or exclusion constraint matching
 * the ON CONFLICT specification". 0031 migratsiyasi hali qo'llanilmagan
 * muhitda `onConflictDoNothing` shu bilan otadi (`insertPreventiveIfAbsent`).
 */
function isMissingConflictIndex(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '42P10'
  );
}

/** Patient join bilan recall select — DTO uchun nom/telefon kerak. */
const recallWithPatientSelect = {
  recall: recalls,
  patientName: patients.fullName,
  patientPhone: patients.phone,
};

const joinRow = (r: {
  recall: typeof recalls.$inferSelect;
  patientName: string;
  patientPhone: string | null;
}): RecallWithPatient => ({
  ...r.recall,
  patientName: r.patientName,
  patientPhone: r.patientPhone,
});

export const createRecallsRepository = () => {
  /** Dashboard list — RLS tenant'ni filtrlaydi. Default: pending + due bugun yoki oldin. */
  async function list(c: Context, query: ListRecallsQuery): Promise<RecallWithPatient[]> {
    const db = getDb(c);
    const filters = [];
    // Default sana — bugungacha (klinika-local kun string'i route'da beriladi).
    if (query.date) filters.push(lte(recalls.dueDate, query.date));
    filters.push(query.status ? eq(recalls.status, query.status) : eq(recalls.status, 'pending'));
    if (query.branchId) filters.push(eq(recalls.branchId, query.branchId));

    const rows = await db
      .select(recallWithPatientSelect)
      .from(recalls)
      .innerJoin(patients, eq(patients.id, recalls.patientId))
      .where(and(...filters))
      .orderBy(recalls.dueDate, desc(recalls.createdAt));
    return rows.map(joinRow);
  }

  /** Bemor bo'yicha barcha recall'lar (holatdan qat'i nazar). */
  async function listByPatient(c: Context, patientId: string): Promise<RecallWithPatient[]> {
    const db = getDb(c);
    const rows = await db
      .select(recallWithPatientSelect)
      .from(recalls)
      .innerJoin(patients, eq(patients.id, recalls.patientId))
      .where(eq(recalls.patientId, patientId))
      .orderBy(desc(recalls.dueDate));
    return rows.map(joinRow);
  }

  async function findById(c: Context, id: string): Promise<RecallWithPatient | null> {
    const db = getDb(c);
    const [row] = await db
      .select(recallWithPatientSelect)
      .from(recalls)
      .innerJoin(patients, eq(patients.id, recalls.patientId))
      .where(eq(recalls.id, id))
      .limit(1);
    return row ? joinRow(row) : null;
  }

  async function insert(c: Context, values: RecallInsert): Promise<RecallWithPatient | null> {
    const db = getDb(c);
    const [row] = await db.insert(recalls).values(values).returning();
    if (!row) return null;
    return findById(c, row.id);
  }

  /**
   * Idempotent auto-create (B4). Partial unique index `(patientId, sourceStageId)
   * WHERE status in (pending,contacted)` bo'yicha conflict → DO NOTHING.
   * ⚠️ `targetWhere` index predikatiga AYNAN mos bo'lishi shart (qisman index
   * inference uchun). NULL sourceStageId NULL'lar distinct → bu yo'l dedupe
   * QILMAYDI; preventive yo'li service'da transition + open-check bilan gate'lanadi.
   * Yaratilgan bo'lsa true, conflict (skip) bo'lsa false.
   */
  async function insertIfAbsent(c: Context, values: RecallInsert): Promise<boolean> {
    const db = getDb(c);
    const inserted = await db
      .insert(recalls)
      .values(values)
      .onConflictDoNothing({
        target: [recalls.patientId, recalls.sourceStageId],
        // Qisman index predikati — index `WHERE`'iga AYNAN mos bo'lishi shart.
        where: sql`status in ('pending', 'contacted')`,
      })
      .returning({ id: recalls.id });
    return inserted.length > 0;
  }

  /**
   * A8 (CLI-438): preventive-recall idempotent auto-create — defense-in-depth
   * qatlami. Service'dagi `hasOpenByReason` check-then-insert bo'lib, race
   * ostida (ikki concurrent request) ikkita ochiq preventive yaratilishi mumkin
   * edi (dedupe faqat SELECT'da, INSERT'gacha bo'lgan oynada emas — `hasOpenByReason`
   * FAQAT dublikat allaqachon mavjud bo'lganda himoya qiladi, oddiy holatda —
   * bemorda ochiq preventive yo'q — to'g'ridan shu funksiyaga tushamiz). `sourceStageId`
   * NULL bo'lgani uchun eski `recalls_patient_stage_open_unique` indeks (yuqorida)
   * NULL'larni distinct deb hisoblab dedupe QILMAYDI (Postgres semantikasi).
   *
   * Fix: yangi partial unique index `recalls_patient_preventive_open_unique`
   * (drizzle/0031 — qo'lda SQL migratsiya, sourceStageId NI EMAS, faqat
   * `patientId`ni target qiladi, shuning uchun NULL muammosi yo'q) + shu index'ga
   * mos `onConflictDoNothing`. ⚠️ Index `packages/db-schema` schema.ts'da
   * DEKLARATSIYA QILINMAGAN (bu fayl shu agent egaligidan tashqari) — DB'da
   * mavjud bo'lishi kerak, lekin Drizzle snapshot bilan drift bor; db-schema
   * egasi index'ni schema.ts'ga qo'shishi kerak (kelajakdagi `drizzle-kit
   * generate` uchun).
   *
   * ⚠️ MUHIM: `ON CONFLICT ... WHERE ... DO NOTHING` mos partial unique index
   * TOPILMASA, Postgres oddiy INSERT'ga "yumshab" QOLMAYDI — `42P10` ("no unique
   * or exclusion constraint matching ON CONFLICT") xatosi bilan OTADI. Agar 0031
   * migratsiyasi hali qo'llanilmagan bo'lsa, bu — `autoCreatePreventive`ning
   * ODDIY (dublikatsiz) yo'lida ham xato degani (appointment allaqachon
   * completed'ga yozilgan, lekin recall yaratish 500 qaytaradi). Shuning uchun
   * `42P10`ni ANIQ ushlab, oddiy (himoyasiz, lekin funksional) INSERT'ga
   * qaytamiz — 0031 hali qo'llanilmagan muhitda ham funksionallik saqlanadi,
   * faqat DB-darajasidagi qo'shimcha himoya yo'qoladi (service `hasOpenByReason`
   * pre-check hamon ishlaydi).
   */
  async function insertPreventiveIfAbsent(c: Context, values: RecallInsert): Promise<boolean> {
    const db = getDb(c);
    try {
      const inserted = await db
        .insert(recalls)
        .values(values)
        .onConflictDoNothing({
          target: [recalls.patientId],
          where: sql`reason = 'preventive' and status in ('pending', 'contacted')`,
        })
        .returning({ id: recalls.id });
      return inserted.length > 0;
    } catch (err) {
      if (isMissingConflictIndex(err)) {
        const [row] = await db.insert(recalls).values(values).returning({ id: recalls.id });
        return !!row;
      }
      throw err;
    }
  }

  /** Bemorda berilgan reason bo'yicha ochiq recall bormi (preventive dedupe, B4). */
  async function hasOpenByReason(
    c: Context,
    patientId: string,
    reason: RecallInsert['reason'],
  ): Promise<boolean> {
    const db = getDb(c);
    const [row] = await db
      .select({ id: recalls.id })
      .from(recalls)
      .where(
        and(
          eq(recalls.patientId, patientId),
          eq(recalls.reason, reason),
          inArray(recalls.status, ['pending', 'contacted']),
        ),
      )
      .limit(1);
    return !!row;
  }

  /** Bemorning ochiq (pending/contacted) recall'larini topadi (rebook-close, B5). */
  async function findOpenByPatient(
    c: Context,
    patientId: string,
  ): Promise<(typeof recalls.$inferSelect)[]> {
    const db = getDb(c);
    return db
      .select()
      .from(recalls)
      .where(
        and(eq(recalls.patientId, patientId), inArray(recalls.status, ['pending', 'contacted'])),
      );
  }

  /**
   * Yozilish bekor/no_show bo'lganda uni yopgan recall'larni qayta ochadi (B/CLI-426):
   * `scheduled_appointment_id = appointmentId AND status='scheduled'` → `pending`ga
   * qaytar, link/closedBy/closedAt tozala. dueDate o'zgarmaydi. Idempotent (topilmasa
   * no-op). Qaytadi: qayta ochilgan qatorlar soni. RLS tenant-scoped.
   */
  async function reopenByAppointment(c: Context, appointmentId: string): Promise<number> {
    const db = getDb(c);
    const rows = await db
      .update(recalls)
      .set({
        status: 'pending',
        scheduledAppointmentId: null,
        closedBy: null,
        closedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(recalls.scheduledAppointmentId, appointmentId), eq(recalls.status, 'scheduled')),
      )
      .returning({ id: recalls.id });
    return rows.length;
  }

  async function update(
    c: Context,
    id: string,
    patch: Partial<typeof recalls.$inferSelect>,
  ): Promise<RecallWithPatient | null> {
    const db = getDb(c);
    const [row] = await db
      .update(recalls)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(recalls.id, id))
      .returning();
    if (!row) return null;
    return findById(c, row.id);
  }

  /**
   * Tenant default recall intervali (oy). tenant_settings row bo'lmasa schema
   * default (6) qaytaradi — auto-create boot'dan oldin row yo'qligida ham ishlasin.
   */
  async function getDefaultIntervalMonths(c: Context): Promise<number> {
    const db = getDb(c);
    const [row] = await db
      .select({ months: tenantSettings.defaultRecallIntervalMonths })
      .from(tenantSettings)
      .limit(1);
    return row?.months ?? 6;
  }

  /**
   * Status bo'yicha sanoq + overdue (dueDate < bugun, ochiq) + efficacy. RLS
   * tenant-scoped. `today` — chaqiruvchi (recalls.service.ts) tomonidan
   * hisoblangan klinika-local (Asia/Tashkent) kun string'i (CLI-466: DB
   * `CURRENT_DATE` session TZ'ga bog'liq — bu yerda parametr sifatida
   * bog'lanadi, `list()`dagi `lte(recalls.dueDate, query.date)` pattern'iga mos).
   */
  async function summary(c: Context, branchId?: string, today?: string) {
    const db = getDb(c);
    const filters = branchId ? [eq(recalls.branchId, branchId)] : [];
    const where = filters.length ? and(...filters) : undefined;
    const todayParam = today ?? new Date().toISOString().slice(0, 10);
    const [row] = await db
      .select({
        pending: sql<number>`COUNT(*) FILTER (WHERE ${recalls.status} = 'pending')`,
        contacted: sql<number>`COUNT(*) FILTER (WHERE ${recalls.status} = 'contacted')`,
        scheduled: sql<number>`COUNT(*) FILTER (WHERE ${recalls.status} = 'scheduled')`,
        completed: sql<number>`COUNT(*) FILTER (WHERE ${recalls.status} = 'completed')`,
        total: count(),
        overdue: sql<number>`COUNT(*) FILTER (WHERE ${recalls.dueDate} < ${todayParam} AND ${recalls.status} IN ('pending','contacted'))`,
      })
      .from(recalls)
      .where(where);
    return {
      pending: Number(row?.pending ?? 0),
      contacted: Number(row?.contacted ?? 0),
      scheduled: Number(row?.scheduled ?? 0),
      completed: Number(row?.completed ?? 0),
      overdue: Number(row?.overdue ?? 0),
      total: Number(row?.total ?? 0),
    };
  }

  return {
    list,
    listByPatient,
    findById,
    insert,
    insertIfAbsent,
    insertPreventiveIfAbsent,
    hasOpenByReason,
    findOpenByPatient,
    reopenByAppointment,
    update,
    getDefaultIntervalMonths,
    summary,
  };
};

export type RecallsRepository = ReturnType<typeof createRecallsRepository>;
