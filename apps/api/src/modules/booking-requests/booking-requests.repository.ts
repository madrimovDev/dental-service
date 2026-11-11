import { bookingRequests, branches, patients, users } from '@dental/db-schema';
import { and, count, desc, eq, lt } from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';

/** `pending` so'rov shuncha soatdan keyin `expired` bo'ladi. */
export const BOOKING_REQUEST_TTL_MS = 24 * 60 * 60_000;

/**
 * 24 soatdan eski `pending` → `expired`. `db` tenant-RLS tx (so'rov ichida —
 * faqat shu tenant) YOKI admin db (taymer — barcha tenantlar). Idempotent.
 */
export async function expireStaleBookingRequests(
  db: DbOrTx,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .update(bookingRequests)
    .set({ status: 'expired', decidedAt: now })
    .where(
      and(
        eq(bookingRequests.status, 'pending'),
        lt(bookingRequests.createdAt, new Date(now.getTime() - BOOKING_REQUEST_TTL_MS)),
      ),
    )
    .returning({ id: bookingRequests.id });
  return rows.length;
}

export const createBookingRequestsRepository = () => {
  const list = async (c: Context, status: (typeof bookingRequests.$inferSelect)['status']) => {
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
      .where(eq(bookingRequests.status, status))
      .orderBy(desc(bookingRequests.createdAt))
      .limit(200);
  };

  const pendingCount = async (c: Context): Promise<number> => {
    const db = getDb(c);
    const [r] = await db
      .select({ n: count() })
      .from(bookingRequests)
      .where(eq(bookingRequests.status, 'pending'));
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

  const markExpired = async (c: Context, id: string) => {
    const db = getDb(c);
    await db
      .update(bookingRequests)
      .set({ status: 'expired', decidedAt: new Date() })
      .where(and(eq(bookingRequests.id, id), eq(bookingRequests.status, 'pending')));
  };

  return { list, pendingCount, findById, markDecided, markExpired };
};

export type BookingRequestsRepository = ReturnType<typeof createBookingRequestsRepository>;
