import { bookingRequests, branches, patients, users } from '@dental/db-schema';
import { and, count, desc, eq, inArray, lt, lte, or } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import type { PatientMessenger } from '../../lib/telegram/notify.ts';

/** `pending` so'rov shuncha soatdan keyin `expired` bo'ladi. */
export const BOOKING_REQUEST_TTL_MS = 24 * 60 * 60_000;

export type ExpiredBookingRequest = {
  id: string;
  tenantId: string;
  patientId: string;
  requestedStart: Date;
};

/**
 * Muddati tugagan `pending` → `expired` va yopilgan qatorlarni qaytaradi (bemorga xabar uchun).
 * Muddat = so'rov 24 soatdan eski YOKI so'ralgan slot o'tib ketgan (FX-24, LA-40).
 * `db` tenant-RLS tx (so'rov ichida — faqat shu tenant) YOKI admin db (taymer — barcha
 * tenantlar). Idempotent: `status='pending'` sharti — har qator faqat bir marta qaytadi.
 */
export async function expireStaleBookingRequestsReturning(
  db: DbOrTx,
  now: Date = new Date(),
): Promise<ExpiredBookingRequest[]> {
  return db
    .update(bookingRequests)
    .set({ status: 'expired', decidedAt: now })
    .where(
      and(
        eq(bookingRequests.status, 'pending'),
        or(
          lt(bookingRequests.createdAt, new Date(now.getTime() - BOOKING_REQUEST_TTL_MS)),
          lte(bookingRequests.requestedStart, now),
        ),
      ),
    )
    .returning({
      id: bookingRequests.id,
      tenantId: bookingRequests.tenantId,
      patientId: bookingRequests.patientId,
      requestedStart: bookingRequests.requestedStart,
    });
}

/** Yopilgan so'rovlar soni (xabarsiz). */
export async function expireStaleBookingRequests(
  db: DbOrTx,
  now: Date = new Date(),
): Promise<number> {
  return (await expireStaleBookingRequestsReturning(db, now)).length;
}

/**
 * Taymer yo'li (admin conn): muddati tugaganlarni yopadi va har bir bemorga xabar yuboradi
 * (xato yutiladi — messenger o'zi throw qilmaydi; baribir himoya).
 */
export async function expireAndNotifyStaleBookingRequests(
  adminDb: DbOrTx,
  messenger: Pick<PatientMessenger, 'sendBookingDecision'> | undefined,
  now: Date = new Date(),
): Promise<number> {
  const rows = await expireStaleBookingRequestsReturning(adminDb, now);
  if (messenger) {
    for (const r of rows) {
      await messenger
        .sendBookingDecision({
          tenantId: r.tenantId,
          patientId: r.patientId,
          decision: 'expired',
          start: r.requestedStart,
        })
        .catch(() => {});
    }
  }
  return rows.length;
}

export const createBookingRequestsRepository = () => {
  /** `branchIds` null — filial cheklovi yo'q (owner / tenant-wide); aks holda faqat shu filiallar (FX-53). */
  const list = async (
    c: Context,
    status: (typeof bookingRequests.$inferSelect)['status'],
    branchIds: string[] | null = null,
  ) => {
    const db = getDb(c);
    return db
      .select({
        row: bookingRequests,
        branchName: branches.name,
        patientName: patients.fullName,
        doctorName: users.fullName,
      })
      .from(bookingRequests)
      .leftJoin(branches, eq(branches.id, bookingRequests.branchId))
      .leftJoin(patients, eq(patients.id, bookingRequests.patientId))
      .leftJoin(users, eq(users.id, bookingRequests.doctorId))
      .where(
        and(
          eq(bookingRequests.status, status),
          branchIds ? inArray(bookingRequests.branchId, branchIds) : undefined,
        ),
      )
      .orderBy(desc(bookingRequests.createdAt))
      .limit(200);
  };

  const pendingCount = async (c: Context, branchIds: string[] | null = null): Promise<number> => {
    const db = getDb(c);
    const [r] = await db
      .select({ n: count() })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.status, 'pending'),
          branchIds ? inArray(bookingRequests.branchId, branchIds) : undefined,
        ),
      );
    return Number(r?.n ?? 0);
  };

  /** `lock` — SELECT … FOR UPDATE (ikki registrator bir so'rovni bir vaqtda hal qilmasin). */
  const findById = async (c: Context, id: string, opts: { lock?: boolean } = {}) => {
    const db = getDb(c);
    const q = db.select().from(bookingRequests).where(eq(bookingRequests.id, id));
    const [row] = await (opts.lock ? q.for('update') : q);
    return row ?? null;
  };

  const markDecided = async (
    c: Context,
    id: string,
    patch: {
      status: 'confirmed' | 'declined';
      decidedBy: string | null;
      appointmentId?: string | null;
      declineReason?: string | null;
    },
  ) => {
    const db = getDb(c);
    // `status='pending'` guard — poyga (ikki registrator bir vaqtda) ikkinchisini rad etadi.
    const [row] = await db
      .update(bookingRequests)
      .set({
        status: patch.status,
        decidedBy: patch.decidedBy,
        decidedAt: new Date(),
        appointmentId: patch.appointmentId ?? null,
        declineReason: patch.declineReason ?? null,
      })
      .where(and(eq(bookingRequests.id, id), eq(bookingRequests.status, 'pending')))
      .returning();
    return row ?? null;
  };

  const markExpired = async (c: Context, id: string): Promise<boolean> => {
    const db = getDb(c);
    const rows = await db
      .update(bookingRequests)
      .set({ status: 'expired', decidedAt: new Date() })
      .where(and(eq(bookingRequests.id, id), eq(bookingRequests.status, 'pending')))
      .returning({ id: bookingRequests.id });
    return rows.length > 0;
  };

  return { list, pendingCount, findById, markDecided, markExpired };
};

export type BookingRequestsRepository = ReturnType<typeof createBookingRequestsRepository>;
